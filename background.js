// ================================
// BLOCKED DOMAINS
// ================================
const BLOCKED_DOMAINS = [
  "*://www.instagram.com/*",
  "*://instagram.com/*",
  "*://www.twitter.com/*",
  "*://twitter.com/*",
  "*://x.com/*",
  "*://www.x.com/*",
  "*://www.youtube.com/*",
  "*://youtube.com/*",
  "*://www.reddit.com/*",
  "*://reddit.com/*",
  "*://www.facebook.com/*",
  "*://facebook.com/*",
  "*://www.tiktok.com/*",
  "*://tiktok.com/*",
  "*://www.netflix.com/*",
  "*://netflix.com/*",
];

const WEEK = 7 * 24 * 60 * 60 * 1000;
const INACTIVITY_THRESHOLD = 48 * 60 * 60 * 1000;
const REMINDER_ALARM = "deeplockWeekly";
const UNLOCK_ALARM = "unlockAlarm";
const INACTIVITY_ALARM = "inactivityCheck";

// ================================
// MESSAGE FROM POPUP (START FOCUS)
// ================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "startBlock") {
    const lockEndTime = msg.lockEndTime;

    chrome.storage.local.set({
      blockedDomains: BLOCKED_DOMAINS,
      lastFocusTime: Date.now(),
    });

    enableBlocking();

    chrome.alarms.create(UNLOCK_ALARM, { when: lockEndTime });
    console.log("Alarm scheduled");

    sendResponse({ status: "blocking enabled" });
  }
  return true;
});

// ================================
// INSTALL / STARTUP
// ================================
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(REMINDER_ALARM, {
    periodInMinutes: 24 * 60,
  });

  chrome.alarms.create(INACTIVITY_ALARM, {
    periodInMinutes: 24 * 60,
  });

  checkLockStatus();
  checkWeeklyInactivity();
});

chrome.runtime.onStartup.addListener(() => {
  checkLockStatus();
  checkWeeklyInactivity();

  chrome.alarms.get(INACTIVITY_ALARM, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(INACTIVITY_ALARM, {
        periodInMinutes: 24 * 60,
      });
    }
  });
});

// ================================
// WEEKLY INACTIVITY CHECK
// ================================
function checkWeeklyInactivity() {
  chrome.storage.local.get(["lastFocusTime", "lastReminderTime"], (data) => {
    const now = Date.now();

    const inactive = !data.lastFocusTime || now - data.lastFocusTime > WEEK;

    const remindedRecently =
      data.lastReminderTime && now - data.lastReminderTime < WEEK;

    if (!inactive || remindedRecently) return;

    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: "DeepLock",
      message:
        "You haven’t locked distractions in a while. Start a 30-minute focus session?",
      buttons: [{ title: "Start 30 min" }],
    });

    chrome.storage.local.set({ lastReminderTime: now });
  });
}

// ================================
// 48-HOUR INACTIVITY CHECK
// ================================
function checkInactivity() {
  chrome.storage.local.get(["lastFocusTime"], (data) => {
    if (!data.lastFocusTime) return;

    if (Date.now() - data.lastFocusTime >= INACTIVITY_THRESHOLD) {
      sendInactivityNotification();
    }
  });
}

function sendInactivityNotification() {
  chrome.notifications.create("inactivityReminder", {
    type: "basic",
    iconUrl: "icon.png",
    title: "Ready to focus?",
    message:
      "You haven't used Deeplock in 2 days. Start a focus session now.",
    priority: 2,
  });
}

// ================================
// ALARM LISTENER
// ================================
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UNLOCK_ALARM) {
    console.log("Alarm fired");
    unlockSession();
  } else if (alarm.name === REMINDER_ALARM) {
    checkWeeklyInactivity();
  } else if (alarm.name === INACTIVITY_ALARM) {
    checkInactivity();
  }
});

// ================================
// CHECK CURRENT LOCK STATUS
// ================================
function checkLockStatus() {
  chrome.storage.local.get(["isLocked", "lockEndTime"], (data) => {
    if (!data.isLocked) return;

    if (data.lockEndTime > Date.now()) {
      chrome.alarms.create(UNLOCK_ALARM, { when: data.lockEndTime });
      console.log("Alarm scheduled");
      enableBlocking();
    } else {
      unlockSession();
    }
  });
}

// ================================
// ENABLE BLOCKING
// ================================
function enableBlocking() {
  const rules = BLOCKED_DOMAINS.map((domain, index) => ({
    id: 1000 + index,
    priority: 1,
    action: {
      type: "redirect",
      redirect: {
        url: chrome.runtime.getURL("pause.html"),
      },
    },
    condition: {
      urlFilter: domain,
      resourceTypes: ["main_frame"],
    },
  }));

  chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
    const removeRuleIds = existingRules.map((r) => r.id);

    chrome.declarativeNetRequest.updateDynamicRules(
      { removeRuleIds, addRules: rules },
      () => console.log("Blocking enabled"),
    );
  });
}

// ================================
// DISABLE BLOCKING (rules only)
// ================================
function disableBlocking() {
  chrome.declarativeNetRequest.getDynamicRules((rules) => {
    const removeRuleIds = rules.map((r) => r.id);

    chrome.declarativeNetRequest.updateDynamicRules(
      { removeRuleIds },
      () => console.log("Blocking disabled"),
    );
  });
}

// ================================
// UNLOCK SESSION (full cleanup)
// ================================
function unlockSession() {
  chrome.storage.local.get(
    ["lockEndTime", "lastFocusTime", "totalSessions", "totalFocusMinutes"],
    (data) => {
      const sessionMinutes =
        data.lastFocusTime && data.lockEndTime
          ? Math.round((data.lockEndTime - data.lastFocusTime) / 60000)
          : 0;

      const totalSessions = (data.totalSessions || 0) + 1;
      const totalFocusMinutes =
        (data.totalFocusMinutes || 0) + sessionMinutes;

      disableBlocking();
      chrome.storage.local.set({
        isLocked: false,
        lockEndTime: null,
        totalSessions,
        totalFocusMinutes,
      });
      chrome.alarms.clear(UNLOCK_ALARM);
    },
  );
}

// ================================
// NOTIFICATION CLICK (INACTIVITY)
// ================================
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === "inactivityReminder") {
    chrome.action.openPopup();
  }
});

// ================================
// NOTIFICATION BUTTON CLICK
// ================================
chrome.notifications.onButtonClicked.addListener(() => {
  const endTime = Date.now() + 30 * 60 * 1000;

  chrome.storage.local.set({
    isLocked: true,
    lockEndTime: endTime,
    blockedDomains: BLOCKED_DOMAINS,
    lastFocusTime: Date.now(),
  });

  enableBlocking();

  chrome.alarms.create(UNLOCK_ALARM, { when: endTime });
  console.log("Alarm scheduled");
});
