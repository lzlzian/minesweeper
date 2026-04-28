const LEADERBOARD_KEY = 'miningCrawler.leaderboard';
const MAX_ENTRIES = 10;

function isValidEntry(entry) {
  return Number.isFinite(entry?.levelReached) &&
    Number.isFinite(entry?.totalGold) &&
    entry.levelReached >= 1 &&
    entry.totalGold >= 0;
}

export function sortLeaderboard(entries) {
  return [...entries].sort((a, b) =>
    b.levelReached - a.levelReached ||
    b.totalGold - a.totalGold ||
    new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime()
  );
}

export function rankLeaderboard(entries, entry) {
  return sortLeaderboard([...entries, entry].filter(isValidEntry)).slice(0, MAX_ENTRIES);
}

export function getLeaderboard() {
  const raw = localStorage.getItem(LEADERBOARD_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortLeaderboard(parsed.filter(isValidEntry)).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function recordRun({ levelReached, totalGold, cause }) {
  const entry = {
    levelReached: Math.max(1, Math.floor(levelReached || 1)),
    totalGold: Math.max(0, Math.floor(totalGold || 0)),
    cause: cause || 'ended',
    endedAt: new Date().toISOString(),
  };
  const entries = rankLeaderboard(getLeaderboard(), entry);
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
  return entries;
}
