import { readJSON, writeJSON } from "./storage.js";

export interface TrackedUser {
  robloxUserId: number;
  robloxUsername: string;
  addedAt: number;
  lastGameId: string | null;
  lastPlaceId: number | null;
  alertGame: string | null;
}

interface UserTrackerData {
  dmOnJoin: boolean;
  notifyChannelId?: string | null; // null/undefined = DM, string = channel ID
  tracks: Record<string, TrackedUser>; // robloxUserId string -> data
}

const MAX_TRACKS = 15;

function getAll(): Record<string, UserTrackerData> {
  return readJSON<Record<string, UserTrackerData>>("tracker.json");
}

function saveAll(data: Record<string, UserTrackerData>): void {
  writeJSON("tracker.json", data);
}

function getUser(discordUserId: string): UserTrackerData {
  const all = getAll();
  if (!all[discordUserId]) {
    all[discordUserId] = { dmOnJoin: true, tracks: {} };
    saveAll(all);
  }
  return all[discordUserId]!;
}

export function addTrack(discordUserId: string, robloxUserId: number, robloxUsername: string): "added" | "exists" | "limit" {
  const all = getAll();
  if (!all[discordUserId]) all[discordUserId] = { dmOnJoin: true, tracks: {} };
  const key = String(robloxUserId);
  if (all[discordUserId]!.tracks[key]) return "exists";
  if (Object.keys(all[discordUserId]!.tracks).length >= MAX_TRACKS) return "limit";
  all[discordUserId]!.tracks[key] = {
    robloxUserId, robloxUsername,
    addedAt: Date.now(), lastGameId: null, lastPlaceId: null, alertGame: null,
  };
  saveAll(all);
  return "added";
}

export function removeTrack(discordUserId: string, robloxUsername: string): boolean {
  const all = getAll();
  if (!all[discordUserId]) return false;
  const entry = Object.values(all[discordUserId]!.tracks)
    .find(t => t.robloxUsername.toLowerCase() === robloxUsername.toLowerCase());
  if (!entry) return false;
  delete all[discordUserId]!.tracks[String(entry.robloxUserId)];
  saveAll(all);
  return true;
}

export function getTracksForUser(discordUserId: string): TrackedUser[] {
  return Object.values(getUser(discordUserId).tracks);
}

export function getAllTracks(): Array<TrackedUser & { discordUserId: string }> {
  const all = getAll();
  const result: Array<TrackedUser & { discordUserId: string }> = [];
  for (const [discordUserId, userData] of Object.entries(all)) {
    for (const track of Object.values(userData.tracks)) {
      result.push({ ...track, discordUserId });
    }
  }
  return result;
}

export function updateLastGame(discordUserId: string, robloxUserId: number, gameId: string | null, placeId: number | null): void {
  const all = getAll();
  const key = String(robloxUserId);
  if (all[discordUserId]?.tracks[key]) {
    all[discordUserId]!.tracks[key]!.lastGameId = gameId;
    all[discordUserId]!.tracks[key]!.lastPlaceId = placeId;
    saveAll(all);
  }
}

export function setTrackAlert(discordUserId: string, robloxUserId: number, alertGame: string | null): void {
  const all = getAll();
  const key = String(robloxUserId);
  if (all[discordUserId]?.tracks[key]) {
    all[discordUserId]!.tracks[key]!.alertGame = alertGame;
    saveAll(all);
  }
}

export function getDmOnJoin(discordUserId: string): boolean {
  return getUser(discordUserId).dmOnJoin;
}

export function setDmOnJoin(discordUserId: string, value: boolean): void {
  const all = getAll();
  if (!all[discordUserId]) all[discordUserId] = { dmOnJoin: value, tracks: {} };
  else all[discordUserId]!.dmOnJoin = value;
  saveAll(all);
}

export function getNotifyChannelId(discordUserId: string): string | null {
  return getUser(discordUserId).notifyChannelId ?? null;
}

export function setNotifyChannelId(discordUserId: string, channelId: string | null): void {
  const all = getAll();
  if (!all[discordUserId]) all[discordUserId] = { dmOnJoin: true, tracks: {} };
  all[discordUserId]!.notifyChannelId = channelId;
  saveAll(all);
}

export { MAX_TRACKS };
