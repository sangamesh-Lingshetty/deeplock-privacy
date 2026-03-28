let currentDomain = "";
let strictMode = false;

chrome.runtime.sendMessage({ action: "consumeAutoKillIntervention" }, (res) => {
  const data = res?.data || {};
  currentDomain = data.domain || "the site";
  strictMode = !!data.strictMode;
  const domainEl = document.getElementById("killDomain");
  const messageEl = document.getElementById("killMessage");
  const strictBanner = document.getElementById("strictBanner");
  const continueBtn = document.getElementById("continueBtn");
  if (domainEl) domainEl.textContent = currentDomain;
  if (messageEl) {
    messageEl.textContent = strictMode
      ? `DeepLock noticed ${data.minutes || 10} minute${(data.minutes || 10) === 1 ? "" : "s"} on ${currentDomain}. Strict Mode is enabled, so you cannot continue from here.`
      : `DeepLock noticed ${data.minutes || 10} minutes on ${currentDomain}. Continue if you mean it, or lock back in now.`;
  }
  if (strictBanner) {
    strictBanner.style.display = strictMode ? "block" : "none";
  }
  if (continueBtn && strictMode) {
    continueBtn.disabled = true;
    continueBtn.textContent = "Strict Mode enabled";
  }
});

document.getElementById("lockNowBtn")?.addEventListener("click", () => {
  chrome.runtime.sendMessage(
    { action: "autoKillLockNow", domain: currentDomain },
    () => window.close(),
  );
});

document.getElementById("continueBtn")?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "autoKillContinue" }, () => {
    if (!strictMode) window.close();
  });
});
