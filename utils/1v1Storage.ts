import { readJSON, writeJSON } from "./storage.js";

export const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

export interface RankedPlayer {
  userId: string;
  spot: number;
  cooldownUntil: number | null;
  pendingChallengeId: string | null;
}

export interface PendingChallenge {
  id: string;
  challengerId: string;
  opponentId: string;
  opponentSpot: number;
  challengerSpot: number | null;
  guildId: string;
  channelId: string;
  messageId: string;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "accepted" | "cancelled" | "completed";
}

export interface RaidRecord {
  id: string;
  guildId: string;
  timestamp: number;
  attendees: string[];
}

export interface MatchRecord {
  id: string;
  guildId: string;
  timestamp: number;
  winnerId: string;
  loserId: string;
  winnerSpot: number;
  loserSpot: number | null;
  loserRemoved: boolean;
  autoForfeit: boolean;
  challengeId: string;
}

// ── guild 1v1 settings ─────────────────────────────────────────────────────────

interface Guild1v1Settings {
  matchLogChannelId?: string;
  liveLeaderboardChannelId?: string;
  liveLeaderboardMessageId?: string;
}

function getAllGuild1v1Settings(): Record<string, Guild1v1Settings> {
  return readJSON<Record<string, Guild1v1Settings>>("1v1_settings.json");
}

function saveGuild1v1Settings(guildId: string, s: Guild1v1Settings): void {
  const all = getAllGuild1v1Settings();
  all[guildId] = s;
  writeJSON("1v1_settings.json", all);
}

function getGuild1v1Settings(guildId: string): Guild1v1Settings {
  return getAllGuild1v1Settings()[guildId] ?? {};
}

export function getMatchLogChannel(guildId: string): string | null {
  return getGuild1v1Settings(guildId).matchLogChannelId ?? null;
}

export function setMatchLogChannel(guildId: string, channelId: string | null): void {
  const s = getGuild1v1Settings(guildId);
  if (channelId === null) delete s.matchLogChannelId;
  else s.matchLogChannelId = channelId;
  saveGuild1v1Settings(guildId, s);
}

export function getLiveLeaderboard(guildId: string): { channelId: string; messageId: string } | null {
  const s = getGuild1v1Settings(guildId);
  if (!s.liveLeaderboardChannelId || !s.liveLeaderboardMessageId) return null;
  return { channelId: s.liveLeaderboardChannelId, messageId: s.liveLeaderboardMessageId };
}

export function setLiveLeaderboard(guildId: string, channelId: string, messageId: string): void {
  const s = getGuild1v1Settings(guildId);
  s.liveLeaderboardChannelId = channelId;
  s.liveLeaderboardMessageId = messageId;
  saveGuild1v1Settings(guildId, s);
}

// ── leaderboard ───────────────────────────────────────────────────────────────

function getAllLBs(): Record<string, Record<string, RankedPlayer>> {
  return readJSON<Record<string, Record<string, RankedPlayer>>>("1v1_leaderboard.json");
}

export function getLeaderboard(guildId: string): Record<string, RankedPlayer> {
  return getAllLBs()[guildId] ?? {};
}

export function saveLeaderboard(guildId: string, lb: Record<string, RankedPlayer>): void {
  const all = getAllLBs();
  all[guildId] = lb;
  writeJSON("1v1_leaderboard.json", all);
}

export function getPlayerBySpot(guildId: string, spot: number): RankedPlayer | null {
  return getLeaderboard(guildId)[String(spot)] ?? null;
}

export function getPlayerEntry(guildId: string, userId: string): { player: RankedPlayer; spot: number } | null {
  const lb = getLeaderboard(guildId);
  for (const [s, p] of Object.entries(lb)) {
    if (p.userId === userId) return { player: p, spot: Number(s) };
  }
  return null;
}

export function setPlayerAtSpot(guildId: string, spot: number, player: RankedPlayer): void {
  const lb = getLeaderboard(guildId);
  lb[String(spot)] = { ...player, spot };
  saveLeaderboard(guildId, lb);
}

export function removeFromSpot(guildId: string, spot: number): void {
  const lb = getLeaderboard(guildId);
  delete lb[String(spot)];
  saveLeaderboard(guildId, lb);
}

export function swapSpots(guildId: string, spotA: number, spotB: number): void {
  const lb = getLeaderboard(guildId);
  const pA = lb[String(spotA)];
  const pB = lb[String(spotB)];
  if (pA && pB) {
    lb[String(spotA)] = { ...pB, spot: spotA };
    lb[String(spotB)] = { ...pA, spot: spotB };
  } else if (pA) {
    lb[String(spotB)] = { ...pA, spot: spotB };
    delete lb[String(spotA)];
  } else if (pB) {
    lb[String(spotA)] = { ...pB, spot: spotA };
    delete lb[String(spotB)];
  }
  saveLeaderboard(guildId, lb);
}

export function isOnCooldown(p: RankedPlayer): boolean {
  return !!p.cooldownUntil && Date.now() < p.cooldownUntil;
}

export function applyCooldown(guildId: string, userId: string): void {
  const lb = getLeaderboard(guildId);
  for (const [s, p] of Object.entries(lb)) {
    if (p.userId === userId) {
      lb[s] = { ...p, cooldownUntil: Date.now() + TWO_DAYS_MS, pendingChallengeId: null };
      break;
    }
  }
  saveLeaderboard(guildId, lb);
}

export function clearCooldown(guildId: string, userId: string): void {
  const lb = getLeaderboard(guildId);
  for (const [s, p] of Object.entries(lb)) {
    if (p.userId === userId) {
      lb[s] = { ...p, cooldownUntil: null };
      break;
    }
  }
  saveLeaderboard(guildId, lb);
}

// ── challenges ────────────────────────────────────────────────────────────────

function getAllChallenges(): Record<string, PendingChallenge> {
  return readJSON<Record<string, PendingChallenge>>("1v1_challenges.json");
}

export function createChallenge(c: PendingChallenge): void {
  const all = getAllChallenges();
  all[c.id] = c;
  writeJSON("1v1_challenges.json", all);
}

export function getChallenge(id: string): PendingChallenge | null {
  return getAllChallenges()[id] ?? null;
}

export function updateChallenge(id: string, patch: Partial<PendingChallenge>): void {
  const all = getAllChallenges();
  if (!all[id]) return;
  all[id] = { ...all[id]!, ...patch };
  writeJSON("1v1_challenges.json", all);
}

export function deleteChallenge(id: string): void {
  const all = getAllChallenges();
  delete all[id];
  writeJSON("1v1_challenges.json", all);
}

export function getExpiredPendingChallenges(): PendingChallenge[] {
  return Object.values(getAllChallenges()).filter(
    (c) => c.status === "pending" && Date.now() > c.expiresAt,
  );
}

export function getActiveChallengeBetween(
  guildId: string,
  aId: string,
  bId: string,
): PendingChallenge | null {
  return Object.values(getAllChallenges()).find(
    (c) =>
      c.guildId === guildId &&
      c.status === "pending" &&
      ((c.challengerId === aId && c.opponentId === bId) ||
        (c.challengerId === bId && c.opponentId === aId)),
  ) ?? null;
}

// ── match history ─────────────────────────────────────────────────────────────

function getAllMatches(): Record<string, MatchRecord[]> {
  return readJSON<Record<string, MatchRecord[]>>("1v1_matches.json");
}

export function logMatch(guildId: string, record: Omit<MatchRecord, "id" | "guildId" | "timestamp">): string {
  const all = getAllMatches();
  if (!all[guildId]) all[guildId] = [];
  const id = `match_${Date.now()}`;
  all[guildId]!.push({ id, guildId, timestamp: Date.now(), ...record });
  writeJSON("1v1_matches.json", all);
  return id;
}

export function getMatchHistory(guildId: string, userId?: string, limit = 20): MatchRecord[] {
  const all = getAllMatches()[guildId] ?? [];
  const filtered = userId
    ? all.filter((m) => m.winnerId === userId || m.loserId === userId)
    : all;
  return filtered.slice(-limit).reverse();
}

export interface PlayerStats {
  wins: number;
  losses: number;
  forfeits: number;
  currentSpot: number | null;
}

export function getPlayerStats(guildId: string, userId: string): PlayerStats {
  const matches = (getAllMatches()[guildId] ?? []).filter(
    (m) => m.winnerId === userId || m.loserId === userId,
  );
  const wins = matches.filter((m) => m.winnerId === userId).length;
  const losses = matches.filter((m) => m.loserId === userId).length;
  const forfeits = matches.filter((m) => m.loserId === userId && m.autoForfeit).length;
  const entry = getPlayerEntry(guildId, userId);
  return { wins, losses, forfeits, currentSpot: entry?.spot ?? null };
}

// ── raid attendance ───────────────────────────────────────────────────────────

function getAllRaids(): Record<string, RaidRecord[]> {
  return readJSON<Record<string, RaidRecord[]>>("1v1_raids.json");
}

export function logRaid(guildId: string, attendees: string[]): string {
  const all = getAllRaids();
  if (!all[guildId]) all[guildId] = [];
  const id = `raid_${Date.now()}`;
  all[guildId]!.push({ id, guildId, timestamp: Date.now(), attendees });
  writeJSON("1v1_raids.json", all);
  return id;
}

export function getRecentRaids(guildId: string, limit = 10): RaidRecord[] {
  const all = getAllRaids();
  return (all[guildId] ?? []).slice(-limit).reverse();
}

export function getAttendanceInLastN(guildId: string, userId: string, n = 2): number {
  return getRecentRaids(guildId, n).filter((r) => r.attendees.includes(userId)).length;
}
