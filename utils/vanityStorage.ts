import { readJSON, writeJSON } from "./storage.js";

interface FlaggedMember {
  vanity: string;
  flaggedAt: number;
}

interface GuildVanitySettings {
  enabled: boolean;
  logChannel?: string;
  oppVanities: string[];
  whitelistedVanities: string[];
  flaggedMembers: Record<string, FlaggedMember>;
  silentVanities: string[];
  pingRoleId?: string;
}

function getAll(): Record<string, GuildVanitySettings> {
  return readJSON<Record<string, GuildVanitySettings>>("vanity.json");
}

function saveAll(data: Record<string, GuildVanitySettings>): void {
  writeJSON("vanity.json", data);
}

function getGuildVanity(guildId: string): GuildVanitySettings {
  const all = getAll();
  if (!all[guildId]) {
    all[guildId] = { enabled: true, oppVanities: [], whitelistedVanities: [], flaggedMembers: {}, silentVanities: [] };
    saveAll(all);
  }
  if (!all[guildId]!.silentVanities) {
    all[guildId]!.silentVanities = [];
    saveAll(all);
  }
  return all[guildId]!;
}

function setGuildVanity(guildId: string, data: GuildVanitySettings): void {
  const all = getAll();
  all[guildId] = data;
  saveAll(all);
}

export function isVanityWatcherEnabled(guildId: string): boolean {
  return getGuildVanity(guildId).enabled;
}

export function toggleVanityWatcher(guildId: string): boolean {
  const s = getGuildVanity(guildId);
  s.enabled = !s.enabled;
  setGuildVanity(guildId, s);
  return s.enabled;
}

export function getVanityLogChannel(guildId: string): string | undefined {
  return getGuildVanity(guildId).logChannel;
}

export function setVanityLogChannel(guildId: string, channelId: string): void {
  const s = getGuildVanity(guildId);
  s.logChannel = channelId;
  setGuildVanity(guildId, s);
}

export function getOppVanities(guildId: string): string[] {
  return getGuildVanity(guildId).oppVanities;
}

export function addOppVanity(guildId: string, vanity: string): boolean {
  const s = getGuildVanity(guildId);
  const v = vanity.toLowerCase().replace(/^\//, "");
  if (s.oppVanities.includes(v)) return false;
  s.oppVanities.push(v);
  setGuildVanity(guildId, s);
  return true;
}

export function removeOppVanity(guildId: string, vanity: string): boolean {
  const s = getGuildVanity(guildId);
  const v = vanity.toLowerCase().replace(/^\//, "");
  const idx = s.oppVanities.indexOf(v);
  if (idx === -1) return false;
  s.oppVanities.splice(idx, 1);
  setGuildVanity(guildId, s);
  return true;
}

export function getWhitelistedVanities(guildId: string): string[] {
  return getGuildVanity(guildId).whitelistedVanities;
}

export function addWhitelistedVanity(guildId: string, vanity: string): boolean {
  const s = getGuildVanity(guildId);
  const v = vanity.toLowerCase().replace(/^\//, "");
  if (s.whitelistedVanities.includes(v)) return false;
  s.whitelistedVanities.push(v);
  setGuildVanity(guildId, s);
  return true;
}

export function removeWhitelistedVanity(guildId: string, vanity: string): boolean {
  const s = getGuildVanity(guildId);
  const v = vanity.toLowerCase().replace(/^\//, "");
  const idx = s.whitelistedVanities.indexOf(v);
  if (idx === -1) return false;
  s.whitelistedVanities.splice(idx, 1);
  setGuildVanity(guildId, s);
  return true;
}

export function getFlaggedMembers(guildId: string): Record<string, FlaggedMember> {
  return getGuildVanity(guildId).flaggedMembers;
}

export function flagMember(guildId: string, userId: string, vanity: string): void {
  const s = getGuildVanity(guildId);
  s.flaggedMembers[userId] = { vanity, flaggedAt: Date.now() };
  setGuildVanity(guildId, s);
}

export function unflagMember(guildId: string, userId: string): boolean {
  const s = getGuildVanity(guildId);
  if (!s.flaggedMembers[userId]) return false;
  delete s.flaggedMembers[userId];
  setGuildVanity(guildId, s);
  return true;
}

export function isMemberFlagged(guildId: string, userId: string): boolean {
  return !!getGuildVanity(guildId).flaggedMembers[userId];
}

// ── silent vanities (flag but no ping) ────────────────────────────────────────

export function getSilentVanities(guildId: string): string[] {
  return getGuildVanity(guildId).silentVanities;
}

export function addSilentVanity(guildId: string, vanity: string): boolean {
  const s = getGuildVanity(guildId);
  const v = vanity.toLowerCase().replace(/^\//, "");
  if (s.silentVanities.includes(v)) return false;
  s.silentVanities.push(v);
  setGuildVanity(guildId, s);
  return true;
}

export function removeSilentVanity(guildId: string, vanity: string): boolean {
  const s = getGuildVanity(guildId);
  const v = vanity.toLowerCase().replace(/^\//, "");
  const idx = s.silentVanities.indexOf(v);
  if (idx === -1) return false;
  s.silentVanities.splice(idx, 1);
  setGuildVanity(guildId, s);
  return true;
}

// ── ping role ─────────────────────────────────────────────────────────────────

export function getVanityPingRole(guildId: string): string | undefined {
  return getGuildVanity(guildId).pingRoleId;
}

export function setVanityPingRole(guildId: string, roleId: string | null): void {
  const s = getGuildVanity(guildId);
  if (roleId === null) {
    delete s.pingRoleId;
  } else {
    s.pingRoleId = roleId;
  }
  setGuildVanity(guildId, s);
}
