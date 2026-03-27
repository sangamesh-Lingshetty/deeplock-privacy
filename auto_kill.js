let currentDomain = "";

chrome.runtime.sendMessage({ action: "consumeAutoKillIntervention" }, (res) => {
  const data = res?.data || {};
  currentDomain = data.domain || "the site";
  const domainEl = document.getElementById("killDomain");
  const messageEl = document.getElementById("killMessage");
  if (domainEl) domainEl.textContent = currentDomain;
  if (messageEl) {
    messageEl.textContent = `DeepLock noticed ${data.minutes || 10} minutes on ${currentDomain}. Continue if you mean it, or lock back in now.`;
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
    window.close();
  });
});
