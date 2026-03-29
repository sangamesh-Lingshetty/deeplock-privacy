const QUICK_BLOCK_SITES = [
  { name: "YouTube", domain: "youtube.com", filter: "||youtube.com^" },
  { name: "Instagram", domain: "instagram.com", filter: "||instagram.com^" },
  { name: "X / Twitter", domain: "x.com", filter: "||x.com^" },
  { name: "Reddit", domain: "reddit.com", filter: "||reddit.com^" },
  { name: "Facebook", domain: "facebook.com", filter: "||facebook.com^" },
];

const QUICK_BLOCK_KEY = "popupQuickBlockedDomains";
const AUTO_KILL_SUGGESTED_INTENT_KEY = "autoKillSuggestedIntent";

let selectedMinutes = null;
let timerInterval = null;
let sessionDurationTotal = 0;

init();

function init() {
  bindEvents();
  refreshProStatusOnOpen();
  hydrateSuggestedIntent();
  loadQuickSites();
  restoreSessionIfActive();
}

function hydrateSuggestedIntent() {
  chrome.storage.local.get([AUTO_KILL_SUGGESTED_INTENT_KEY], (data) => {
    const suggested = (data[AUTO_KILL_SUGGESTED_INTENT_KEY] || "").trim();
    if (!suggested) return;

    const input = document.getElementById("focusIntent");
    if (input && !input.value.trim()) {
      input.value = suggested;
    }

    chrome.storage.local.remove(AUTO_KILL_SUGGESTED_INTENT_KEY);
  });
}

function bindEvents() {
  document.querySelectorAll(".time-btn").forEach((btn) => {
    btn.addEventListener("click", () => selectTime(btn));
  });

  document.getElementById("startBtn")?.addEventListener("click", startSession);
  document
    .getElementById("dashboardBtn")
    ?.addEventListener("click", () => openDashboard());
  document
    .getElementById("activeDashboardBtn")
    ?.addEventListener("click", () => openDashboard());
  document
    .getElementById("moreSitesBtn")
    ?.addEventListener("click", () => openDashboard("sites"));
  document
    .getElementById("activateLicenseBtn")
    ?.addEventListener("click", () => {
      handleActivateLicense().catch((error) => {
        console.error("[DeepLock] License activation failed:", error);
        setLicenseStatus("Activation failed. Try again.", true);
      });
    });

  document.getElementById("focusIntent")?.addEventListener("input", () => {
    const input = document.getElementById("focusIntent");
    if (input) input.style.borderColor = "";
  });
}

async function refreshProStatusOnOpen() {
  try {
    const pro = await chrome.runtime.sendMessage({ action: "validateLicense" });
    if (chrome.runtime.lastError) return;
    await chrome.storage.local.set({
      isPro: !!pro.isPro,
      subscriptionPlan: pro.plan || (pro.isPro ? "pro" : "free"),
      subscriptionStatus: pro.status || (pro.isPro ? "active" : "inactive"),
      subscriptionSource: pro.source || "",
      lastProServerSyncAt: Date.now(),
    });

    if (pro.isPro) {
      setLicenseStatus("Pro is active on this account.", false);
    }
  } catch (_) {
    // Best-effort refresh only.
  }
}

function setLicenseStatus(message, isError = false) {
  const status = document.getElementById("licenseStatus");
  if (!status) return;
  status.textContent = message || "";
  status.dataset.state = isError ? "error" : "success";
}

async function handleActivateLicense() {
  const input = document.getElementById("licenseKeyInput");
  const licenseKey = input?.value?.trim() || "";

  if (!licenseKey) {
    setLicenseStatus("Enter your license key.", true);
    return;
  }

  const session = await getSession();
  if (!session) {
    setLicenseStatus("Sign in first before activating Pro.", true);
    return;
  }

  setLicenseStatus("Validating license...", false);

  const result = await validateLicense(licenseKey);
  if (!result.ok) {
    setLicenseStatus(result.error, true);
    return;
  }

  const saved = await saveLicenseToSupabase(session.userId, result.licenseKey);
  if (!saved) {
    setLicenseStatus("License valid, but saving to cloud failed.", true);
    return;
  }

  await chrome.storage.local.set({
    isPro: true,
    licenseKey: result.licenseKey,
    licenseValidatedAt: Date.now(),
    subscriptionPlan: "pro",
    subscriptionStatus: "active",
    subscriptionSource: "legacy_license",
  });

  if (input) input.value = "";
  setLicenseStatus("Pro activated successfully.", false);
}

function selectTime(btn) {
  document
    .querySelectorAll(".time-btn")
    .forEach((node) => node.classList.remove("selected"));
  btn.classList.add("selected");
  selectedMinutes = Number(btn.dataset.min);
  updateStartButton();
}

function updateStartButton() {
  const button = document.getElementById("startBtn");
  const label = document.getElementById("startLabel");
  if (!button || !label) return;

  if (!selectedMinutes) {
    button.disabled = true;
    label.textContent = "Choose a timer to lock in";
    return;
  }

  button.disabled = false;
  label.textContent = `Lock in for ${selectedMinutes} minutes`;
}

function getDefaultQuickSites() {
  return QUICK_BLOCK_SITES.map((site) => ({
    ...site,
    enabled: true,
  }));
}

function loadQuickSites() {
  chrome.storage.local.get([QUICK_BLOCK_KEY], (data) => {
    const stored = Array.isArray(data[QUICK_BLOCK_KEY]) ? data[QUICK_BLOCK_KEY] : [];
    const merged = QUICK_BLOCK_SITES.map((site) => {
      const saved = stored.find((item) => item.domain === site.domain);
      return {
        ...site,
        enabled: saved?.enabled !== undefined ? !!saved.enabled : true,
      };
    });
    renderQuickSites(merged);
    chrome.storage.local.set({ [QUICK_BLOCK_KEY]: merged });
  });
}

function renderQuickSites(sites) {
  const list = document.getElementById("quickSitesList");
  if (!list) return;

  list.innerHTML = sites
    .map(
      (site) => `
        <div class="site-row">
          <div class="site-copy">
            <span class="site-dot"></span>
            <div>
              <div class="site-name">${site.name}</div>
              <div class="site-domain">${site.domain}</div>
            </div>
          </div>
          <label class="toggle">
            <input type="checkbox" data-domain="${site.domain}" ${site.enabled ? "checked" : ""} />
            <span class="toggle-ui"></span>
          </label>
        </div>
      `,
    )
    .join("");

  list.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.addEventListener("change", saveQuickSitesFromUI);
  });
}

function saveQuickSitesFromUI() {
  const next = QUICK_BLOCK_SITES.map((site) => ({
    ...site,
    enabled: !!document.querySelector(`input[data-domain="${site.domain}"]`)?.checked,
  }));
  chrome.storage.local.set({ [QUICK_BLOCK_KEY]: next });
}

function getEnabledQuickDomains(callback) {
  chrome.storage.local.get([QUICK_BLOCK_KEY], (data) => {
    const stored = Array.isArray(data[QUICK_BLOCK_KEY]) ? data[QUICK_BLOCK_KEY] : getDefaultQuickSites();
    const enabled = stored
      .filter((site) => site.enabled)
      .map((site) => ({ name: site.name, filter: site.filter, domain: site.domain }));
    callback(enabled);
  });
}

function startSession() {
  if (!selectedMinutes) return;

  const intentInput = document.getElementById("focusIntent");
  const intent = intentInput?.value.trim() || "";

  if (!intent) {
    if (intentInput) {
      intentInput.focus();
      intentInput.style.borderColor = "rgba(255, 77, 77, 0.8)";
    }
    return;
  }

  getEnabledQuickDomains((selectedDomains) => {
    const domainsToBlock =
      selectedDomains.length > 0
        ? selectedDomains
        : QUICK_BLOCK_SITES.map((site) => ({
            name: site.name,
            filter: site.filter,
            domain: site.domain,
          }));

    const startBtn = document.getElementById("startBtn");
    if (startBtn) startBtn.disabled = true;

    const endTime = Date.now() + selectedMinutes * 60 * 1000;
    sessionDurationTotal = selectedMinutes;

    chrome.runtime.sendMessage(
      {
        action: "startBlock",
        lockEndTime: endTime,
        duration: selectedMinutes,
        intent,
        energyLevel: null,
        pinHash: null,
        selectedBlockedDomains: domainsToBlock,
      },
      (res) => {
        if (res?.status === "limit_reached") {
          if (startBtn) startBtn.disabled = false;
          return;
        }
        showActiveState(endTime);
      },
    );
  });
}

function restoreSessionIfActive() {
  chrome.storage.local.get(["isLocked", "lockEndTime", "sessionDuration"], (data) => {
    if (data.isLocked && data.lockEndTime && data.lockEndTime > Date.now()) {
      sessionDurationTotal = data.sessionDuration || 15;
      showActiveState(data.lockEndTime);
    }
  });
}

function showActiveState(endTime) {
  const inactive = document.getElementById("inactive");
  const active = document.getElementById("active");
  if (inactive) inactive.style.display = "none";
  if (active) active.style.display = "flex";

  chrome.storage.local.get(["focusIntent", "sessionDuration", "blockedDomains"], (data) => {
    const intentEl = document.getElementById("sessionIntent");
    const blockCountEl = document.getElementById("sessionBlockCount");

    if (intentEl) intentEl.textContent = data.focusIntent || "";
    sessionDurationTotal = data.sessionDuration || selectedMinutes || 15;

    if (blockCountEl) {
      const domains = Array.isArray(data.blockedDomains) ? data.blockedDomains : [];
      blockCountEl.textContent = String(domains.length);
    }
  });

  startTimerUI(endTime);
}

function startTimerUI(endTime) {
  if (timerInterval) clearInterval(timerInterval);

  function tick() {
    const remaining = Math.max(0, endTime - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const timerEl = document.getElementById("timer");
    if (timerEl) {
      timerEl.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
    }
    if (remaining <= 0) clearInterval(timerInterval);
  }

  tick();
  timerInterval = setInterval(tick, 1000);
}

function openDashboard(tab = "") {
  const suffix = tab ? `#${tab}` : "";
  chrome.tabs.create({ url: `${chrome.runtime.getURL("dashboard.html")}${suffix}` });
}
