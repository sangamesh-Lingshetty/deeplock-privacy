(function () {
  const OVERLAY_ID = "deeplock-smartlock-overlay";

  function removeOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
  }

  function resolveStrictMode(fallback, callback) {
    chrome.runtime.sendMessage({ action: "consumeAutoKillIntervention" }, (res) => {
      const strictMode = res?.data?.strictMode;
      callback(typeof strictMode === "boolean" ? strictMode : !!fallback);
    });
  }

  function createOverlay(domain, minutes, strictMode) {
    removeOverlay();

    const host = document.createElement("div");
    host.id = OVERLAY_ID;
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.zIndex = "2147483647";
    host.style.background = "rgba(6, 8, 14, 0.72)";
    host.style.backdropFilter = "blur(8px)";
    host.style.display = "flex";
    host.style.alignItems = "center";
    host.style.justifyContent = "center";
    host.style.padding = "24px";

    const card = document.createElement("div");
    card.style.width = "min(420px, 100%)";
    card.style.borderRadius = "24px";
    card.style.padding = "28px 24px";
    card.style.background =
      "linear-gradient(180deg, rgba(18,21,28,0.98), rgba(11,14,20,0.98))";
    card.style.border = "1px solid rgba(239,68,68,0.22)";
    card.style.boxShadow = "0 24px 80px rgba(0,0,0,0.45)";
    card.style.color = "#f8fafc";
    card.style.fontFamily = '"DM Sans", system-ui, sans-serif';
    card.style.textAlign = "center";

    card.innerHTML = `
      <div style="font:700 10px 'Space Mono', monospace; letter-spacing:2px; color:#f87171; margin-bottom:16px;">
        DEEPLOCK ACTIVE
      </div>
      <div style="font:700 28px 'Space Mono', monospace; line-height:1.2; margin-bottom:12px;">
        Come back to your day
      </div>
      <div style="display:inline-flex; align-items:center; justify-content:center; padding:8px 12px; border-radius:999px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); font:700 12px 'Space Mono', monospace; margin-bottom:18px;">
        ${domain}
      </div>
      <div style="font-size:14px; line-height:1.8; color:#cbd5e1; margin-bottom:22px;">
        ${
          strictMode
            ? `DeepLock noticed ${minutes} minute${minutes === 1 ? "" : "s"} on ${domain}. Strict Mode is enabled, so you cannot continue from here.`
            : `DeepLock noticed ${minutes} minute${minutes === 1 ? "" : "s"} on ${domain}. Continue if you mean it, or lock back in now.`
        }
      </div>
      ${
        strictMode
          ? `<div style="margin:-4px 0 18px; font:700 11px 'Space Mono', monospace; letter-spacing:1.2px; color:#fca5a5;">STRICT MODE ENABLED - CONTINUE BLOCKED</div>`
          : ""
      }
      <div style="display:grid; gap:12px;">
        <button id="deeplock-lock-now" style="border:none; border-radius:14px; padding:14px 16px; font:700 14px 'DM Sans', sans-serif; cursor:pointer; background:#ef4444; color:#fff;">
          Lock it
        </button>
        ${
          strictMode
            ? ""
            : `<button id="deeplock-continue" style="border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:14px 16px; font:700 14px 'DM Sans', sans-serif; cursor:pointer; background:#161c28; color:#e2e8f0;">
          Continue
        </button>`
        }
      </div>
    `;

    host.appendChild(card);
    document.documentElement.appendChild(host);

    card.querySelector("#deeplock-lock-now")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "autoKillLockNow", domain }, () => {
        removeOverlay();
      });
    });

    card.querySelector("#deeplock-continue")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "autoKillContinue" }, (res) => {
        if (res?.ok) removeOverlay();
      });
    });
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.action === "showAutoKillOverlay") {
      resolveStrictMode(!!msg.strictMode, (strictMode) => {
        createOverlay(
          msg.domain || location.hostname,
          Number(msg.minutes) || 10,
          strictMode,
        );
        sendResponse({ ok: true });
      });
      return true;
    }

    if (msg?.action === "hideAutoKillOverlay") {
      removeOverlay();
      sendResponse({ ok: true });
      return true;
    }

    return undefined;
  });
})();
