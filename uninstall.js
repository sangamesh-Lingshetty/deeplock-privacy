function formatHours(minutes) {
  const mins = Number(minutes) || 0;
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

const params = new URLSearchParams(location.search);
document.getElementById("uninstallFocus").textContent = formatHours(
  params.get("totalMins"),
);
document.getElementById("uninstallStreak").textContent = `${params.get("streak") || 0}d`;
document.getElementById("uninstallSessions").textContent = `${params.get("sessions") || 0}`;
