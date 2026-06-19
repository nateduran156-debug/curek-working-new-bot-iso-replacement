import {
  ActivityType, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  SectionBuilder, ThumbnailBuilder, MessageFlags,
  PermissionFlagsBits, type ChatInputCommandInteraction, type GuildMember, type TextChannel, type Guild,
} from "discord.js";
import {
  build1v1Embed, handleChallengeCommand, handle1v1Set, handleLogRound,
  handleHistory, handleStats, handleTop, openLogTicket, sendLogPanel,
} from "./1v1Handler.js";
import { setMatchLogChannel, getIsFrozen, setFrozen } from "../utils/1v1Storage.js";
import { buildHelpMessage } from "../utils/help.js";
import {
  giveRobloxTagRole, getUserByUsername, getGroupRank, validateCookie,
  getUserGroups, isInGroup, getGroupInfo, getGroupInfoBatch, getUserAvatarUrl,
  getUserPresence, getGameName, getPendingJoinRequests, acceptJoinRequest,
} from "../utils/roblox.js";
import {
  getGuild, setGuild, getWhitelist, setWhitelist, getPoints, savePoints,
  memberHasTagManagerRole, memberHasPointsRole, memberHasPSR, memberHasVerificationManagerRole,
  removeVerified, setVerified, setRobloxCookie, createBackup, restoreBackup, setRegistered,
  getBlacklist, addToBlacklist, removeFromBlacklist, isBlacklisted,
} from "../utils/storage.js";
import {
  isVanityWatcherEnabled, toggleVanityWatcher, setVanityLogChannel,
  addOppVanity, removeOppVanity, getOppVanities,
  addWhitelistedVanity, removeWhitelistedVanity, getWhitelistedVanities,
  getFlaggedMembers, unflagMember,
  getSilentVanities, addSilentVanity, removeSilentVanity,
  getVanityPingRole, setVanityPingRole,
} from "../utils/vanityStorage.js";
import {
  addTrack, removeTrack, getTracksForUser, setTrackAlert,
  getDmOnJoin, setDmOnJoin, getNotifyChannelId, setNotifyChannelId, MAX_TRACKS,
} from "../utils/trackerStorage.js";
import { scanAllMembers } from "./vanityHandler.js";
import { buildLeaderboardEmbed, refreshLeaderboard } from "../utils/leaderboard.js";
import { sendTicketPanel } from "./ticketHandler.js";
import { logCommand, logPoints, logSetup, logInfo } from "../utils/botLogger.js";
import { syncRankRoles } from "../utils/ranks.js";

const WHITE = 0x6366f1;
const GREEN = 0x34d399;
const RED   = 0xf43f5e;
const GOLD  = 0xf59e0b;

const OWNER_IDS = new Set(["1456824205545967713", "1490246846583537787"]);

const ALWAYS_FLAGGED: Array<{ id: string; name: string }> = [
  { id: "650907997",  name: "YNGS"     },
  { id: "16848719",   name: "Murked"   },
  { id: "214730861",  name: "MTX"      },
  { id: "33861944",   name: "XVII"     },
  { id: "495825805",  name: "Unloyal"  },
  { id: "862795072",  name: "Flaxx"    },
  { id: "32564331",   name: "EXE"      },
  { id: "265955381",  name: "Woken"    },
  { id: "15957207",   name: "GBG"      },
  { id: "1024109775", name: "Paranoia" },
  { id: "872867055",  name: "Laced"    },
  { id: "34546804",   name: "Snowfall" },
  { id: "489845165",  name: "Fraid"    },
  { id: "91960354",   name: "303w"     },
  { id: "580313332",  name: "Fallenk"  },
  { id: "339952823",  name: "Returnw"  },
  { id: "575770529",  name: "RANGERS"  },
  { id: "140364569",  name: "racek"    },
];
const ALWAYS_FLAGGED_MAP = Object.fromEntries(ALWAYS_FLAGGED.map((g) => [g.id, g.name]));
const ALWAYS_FLAGGED_IDS = new Set(ALWAYS_FLAGGED.map((g) => g.id));



function getMember(i: ChatInputCommandInteraction): GuildMember | null {
  return (i.member as GuildMember | null) ?? null;
}

function isOwner(i: ChatInputCommandInteraction) { return OWNER_IDS.has(i.user.id); }

function isSU(i: ChatInputCommandInteraction): boolean {
  const wl = getWhitelist();
  return isOwner(i) || (wl["bot"] ?? []).includes(i.user.id);
}
function admin(i: ChatInputCommandInteraction): boolean { return isSU(i); }
function mgGuild(i: ChatInputCommandInteraction): boolean { return isSU(i); }
function mgRoles(i: ChatInputCommandInteraction): boolean { return isSU(i); }
function hasFullAccess(i: ChatInputCommandInteraction, cmd: string): boolean {
  const m = getMember(i);
  if (!m) return false;
  const wl = getWhitelist();
  const gid = i.guildId ?? "";
  return (
    isOwner(i) ||
    (wl["bot"] ?? []).includes(i.user.id) ||
    (wl[cmd] ?? []).includes(i.user.id) ||
    memberHasTagManagerRole(m, gid) ||
    memberHasPointsRole(m, gid) ||
    memberHasPSR(m, gid)
  );
}
function canManageGroup(i: ChatInputCommandInteraction): boolean {
  const m = getMember(i);
  if (!m) return false;
  const wl = getWhitelist();
  const gid = i.guildId ?? "";
  return (
    isOwner(i) ||
    (wl["bot"] ?? []).includes(i.user.id) ||
    memberHasTagManagerRole(m, gid) ||
    memberHasVerificationManagerRole(m, gid)
  );
}

async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}


function cv2(color: number, body: string, footer?: string) {
  const c = new ContainerBuilder().setAccentColor(color);
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  if (footer) {
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer}`));
  }
  return c;
}

function cv2h(color: number, header: string, body: string, footer?: string) {
  const c = new ContainerBuilder().setAccentColor(color);
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${header}**`));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  if (footer) {
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer}`));
  }
  return c;
}

function send(c: ContainerBuilder, extra: object[] = []) {
  return { components: [c, ...extra], flags: MessageFlags.IsComponentsV2 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleSlashCommand(i: ChatInputCommandInteraction): Promise<any> {
  const guildId = i.guildId ?? "";

  switch (i.commandName) {

        case "help": {
      return i.reply(buildHelpMessage("setup") as never);
    }

        case "cookie": {
      if (!isOwner(i)) return i.reply({ content: "only the bot owner can set the cookie", ephemeral: true });
      const cookie = i.options.getString("cookie", true).trim();
      await i.deferReply({ ephemeral: true });
      const valid = await validateCookie(cookie);
      if (!valid) return i.editReply({ content: "that cookie doesn't work — double-check it and try again" });
      setRobloxCookie(cookie);
      return i.editReply({ content: `cookie set — logged in as **${valid.name}**` });
    }

        case "sr": {
      if (!admin(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const name = i.options.getString("name", true).trim().toLowerCase();
      if (!name) return i.reply({ content: "need a valid tag name", ephemeral: true });
      const s = getGuild(guildId);
      const existing = s.customTags ?? [];
      if (existing.includes(name)) return i.reply({ content: `\`${name}\` is already a tag option`, ephemeral: true });
      existing.push(name);
      setGuild(guildId, { customTags: existing });
      return i.reply({ content: `tag option \`${name}\` added — it can now be used with \`/role\`` });
    }

        case "role": {
      const m   = getMember(i);
      const wl  = getWhitelist();
      const inDM = !i.guildId;
      const allowed = inDM
        ? (isOwner(i) || (wl["bot"] ?? []).includes(i.user.id))
        : (!!m && (admin(i) || memberHasTagManagerRole(m, guildId)));
      if (!allowed) return i.reply({ content: "you don't have permission to do that", ephemeral: true });

      const s = inDM ? { groupId: null, tagLogChannel: null, logChannel: null, customTags: [] } : getGuild(guildId);
      const customTags = (s as ReturnType<typeof getGuild>).customTags ?? [];
      const STATIC_TAGS = ["sharingan tag", "rockstar", "dark", "faze", "fraid", "member"];
      const ALL_TAGS = [...STATIC_TAGS, ...customTags.map((t) => t.toLowerCase())];

      const username = i.options.getString("roblox", true).trim();
      const tag = i.options.getString("tag", true).toLowerCase();
      if (!ALL_TAGS.includes(tag)) {
        const available = ALL_TAGS.length > 0 ? ALL_TAGS.map((t) => `\`${t}\``).join(", ") : "none — use /sr to add one";
        return i.reply({ content: `\`${tag}\` is not a valid tag. available tags: ${available}`, ephemeral: true });
      }
      await i.deferReply();
      const user = await getUserByUsername(username);
      if (!user) return i.editReply({ content: `can't find **${username}** on roblox` });

      const rankInfo    = s.groupId ? await getGroupRank(user.id, s.groupId).catch(() => null) : null;
      const result      = await giveRobloxTagRole(username, tag, customTags);
      const robloxNote  = result.ok ? `tag **${tag}** assigned on roblox` : `roblox role failed: ${result.reason}`;

      const body = [
        `**${user.name}**`,
        ...(rankInfo ? [`**rank**  ·  ${rankInfo.rankName} (${rankInfo.rankId})`] : []),
        `**tag**  ·  \`${tag}\``,
        robloxNote,
      ].join("\n");

      const c = cv2h(result.ok ? GREEN : RED, "Tag Given", body, `given by ${i.user.username}`);
      await i.editReply(send(c) as Parameters<typeof i.editReply>[0]);

      if (!inDM) {
        const logChannelId = (s as ReturnType<typeof getGuild>).tagLogChannel ?? (s as ReturnType<typeof getGuild>).logChannel;
        if (logChannelId) {
          const logCh = i.guild?.channels.cache.get(logChannelId) as TextChannel | undefined;
          if (logCh) {
            const logBody = [
              `**roblox**  ·  \`${user.name}\``,
              `**given by**  ·  <@${i.user.id}> (${i.user.username})`,
              `**tag**  ·  \`${tag}\``,
              ...(rankInfo ? [`**prev rank**  ·  ${rankInfo.rankName}`] : []),
            ].join("\n");
            await logCh.send(send(cv2h(WHITE, "Tag Given", logBody)) as never).catch(() => {});
          }
        }
        await logCommand(guildId, "Command: /role",
          `<@${i.user.id}> gave tag \`${tag}\` to **${user.name}**`,
          [{ name: "Roblox", value: user.name, inline: true }, { name: "Tag", value: tag, inline: true }],
        );
      }
      return;
    }

        case "gc": {
      const username = i.options.getString("username", true).trim();
      await i.deferReply();
      const user = await getUserByUsername(username);
      if (!user) return i.editReply({ content: `couldn't find **${username}** on roblox` });
      const s       = getGuild(guildId);
      const groupId = s.groupId ?? "703716156";
      const [groups, inGroup, avatarUrl] = await Promise.all([
        getUserGroups(user.id),
        isInGroup(user.id, groupId).catch(() => false),
        getUserAvatarUrl(user.id).catch(() => null),
      ]);
      const guildFlaggedIds = s.flaggedGroups ?? [];
      const flaggedHits     = groups.filter((g) =>
        guildFlaggedIds.includes(String(g.group.id)) || ALWAYS_FLAGGED_IDS.has(String(g.group.id)),
      );
      const isFlagged  = flaggedHits.length > 0;
      const accentColor = isFlagged ? RED : inGroup ? GREEN : WHITE;
      const profileUrl = `https://www.roblox.com/users/${user.id}/profile`;

      const groupLines = groups.length > 0
        ? groups.map((g) => `• [${g.group.name}](https://www.roblox.com/groups/${g.group.id})`)
        : ["• none"];

      const components: object[] = [];

      const mainContainer = new ContainerBuilder().setAccentColor(accentColor);
      if (avatarUrl) {
        const section = new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**[${user.name}](${profileUrl})**`))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
        mainContainer.addSectionComponents(section);
        mainContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
      } else {
        mainContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**[${user.name}](${profileUrl})**`));
        mainContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
      }
      mainContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Groups**\n${groupLines.join("\n")}`));
      components.push(mainContainer);

      if (isFlagged) {
        const flagLines = flaggedHits.map((m) => `• [${m.group.name}](https://www.roblox.com/groups/${m.group.id})`).join("\n");
        components.push(cv2h(RED, "⚠️  Flagged Groups", `not cleared — ask them to leave:\n\n${flagLines}`));
      }

      const groupStatusBody = inGroup
        ? `✓ **[${user.name}](${profileUrl})** is in the group\n\n**group id**  ·  \`${groupId}\`\n**link**  ·  [Join Here](https://www.roblox.com/communities/${groupId})`
        : `✗ **[${user.name}](${profileUrl})** is not in the group\n\n**group id**  ·  \`${groupId}\`\n**link**  ·  [Join Here](https://www.roblox.com/communities/${groupId})`;
      components.push(cv2(accentColor, groupStatusBody));

      return i.editReply({ components: components as never, flags: MessageFlags.IsComponentsV2 });
    }

        case "flag": {
      if (!mgGuild(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const gid = i.options.getString("groupid", true).trim();
      if (isNaN(Number(gid))) return i.reply({ content: "need a valid group id", ephemeral: true });
      if (ALWAYS_FLAGGED_IDS.has(gid)) return i.reply({ content: `\`${gid}\` is already in the global flag list`, ephemeral: true });
      const s       = getGuild(guildId);
      const flagged = s.flaggedGroups ?? [];
      if (flagged.includes(gid)) return i.reply({ content: `\`${gid}\` is already flagged`, ephemeral: true });
      await i.deferReply();
      flagged.push(gid);
      const info       = await getGroupInfo(gid).catch(() => null);
      const groupNames = s.groupNames ?? {};
      if (info?.name) groupNames[String(gid)] = info.name;
      setGuild(guildId, { flaggedGroups: flagged, groupNames });
      await logSetup(guildId, "Group Flagged", `<@${i.user.id}> flagged **${info?.name ?? gid}** (\`${gid}\`)`);
      return i.editReply({ content: `flagged **${info?.name ?? gid}** (\`${gid}\`)` });
    }

        case "unflag": {
      if (!mgGuild(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const gid = i.options.getString("groupid", true).trim();
      if (ALWAYS_FLAGGED_IDS.has(gid)) return i.reply({ content: `\`${gid}\` is in the global list and can't be unflagged`, ephemeral: true });
      const s       = getGuild(guildId);
      const flagged = s.flaggedGroups ?? [];
      if (!flagged.includes(gid)) return i.reply({ content: `\`${gid}\` isn't on the list`, ephemeral: true });
      setGuild(guildId, { flaggedGroups: flagged.filter((g) => g !== gid) });
      await logSetup(guildId, "Group Unflagged", `<@${i.user.id}> unflagged group \`${gid}\``);
      return i.reply({ content: `unflagged \`${gid}\`` });
    }

        case "flist": {
      await i.deferReply();
      const s        = getGuild(guildId);
      const custom   = s.flaggedGroups ?? [];
      const combined = [...new Set([...ALWAYS_FLAGGED.map((g) => g.id), ...custom])];
      const apiMap      = await getGroupInfoBatch(combined);
      const storedNames = s.groupNames ?? {};
      const lines = combined.map((id, idx) => {
        const name = apiMap[id] ?? ALWAYS_FLAGGED_MAP[id] ?? storedNames[id] ?? "Unknown Group";
        return `\`${idx + 1}.\` [${name}](https://www.roblox.com/groups/${id}) \`${id}\``;
      });
      const MAX = 1800;
      const pages: string[] = [];
      let cur = "";
      for (const line of lines) {
        const next = cur ? cur + "\n" + line : line;
        if (next.length > MAX) { pages.push(cur); cur = line; } else { cur = next; }
      }
      if (cur) pages.push(cur);
      const firstC = cv2h(WHITE, `Flagged Groups (${combined.length})`, pages[0]!, "◈  flagged groups");
      await i.editReply(send(firstC) as Parameters<typeof i.editReply>[0]);
      for (let p = 1; p < pages.length; p++) {
        await (i.channel as TextChannel)?.send(send(cv2(WHITE, pages[p]!, `page ${p + 1}/${pages.length}`)) as never);
      }
      return;
    }

        case "verify": {
      if (!mgRoles(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const target     = i.options.getUser("user", true);
      const robloxName = i.options.getString("roblox") ?? null;
      const s          = getGuild(guildId);
      if (!s.verificationRole) return i.reply({ content: "no verification role set — run `/vset @role` first", ephemeral: true });
      const member = await i.guild?.members.fetch(target.id).catch(() => null);
      if (!member) return i.reply({ content: "couldn't find that member", ephemeral: true });
      await member.roles.add(s.verificationRole).catch(() => {});
      if (robloxName) setVerified(target.id, robloxName);
      await logCommand(guildId, "Manual Verify",
        `<@${i.user.id}> verified <@${target.id}>${robloxName ? ` as **${robloxName}**` : ""}`,
        [{ name: "User", value: `<@${target.id}>`, inline: true }, { name: "Roblox", value: robloxName ?? "N/A", inline: true }],
      );
      return i.reply({ content: `verified <@${target.id}>${robloxName ? ` as **${robloxName}**` : ""}` });
    }

        case "unverify": {
      if (!mgRoles(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const target = i.options.getUser("user", true);
      const s      = getGuild(guildId);
      const member = await i.guild?.members.fetch(target.id).catch(() => null);
      if (member && s.verificationRole) await member.roles.remove(s.verificationRole).catch(() => {});
      removeVerified(target.id);
      await logCommand(guildId, "Manual Unverify", `<@${i.user.id}> unverified <@${target.id}>`);
      return i.reply({ content: `removed verification from <@${target.id}>` });
    }

        case "setupticket": {
      if (!mgGuild(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const ch       = i.options.getChannel("channel", true) as TextChannel;
      const type     = (i.options.getString("type") ?? "both") as "verification" | "tag" | "both" | "1v1";
      const category = i.options.getChannel("category") ?? null;
      await i.deferReply();
      await sendTicketPanel(ch, type);
      if (type === "1v1") {
        if (category) setGuild(guildId, { logTicketCategoryId: category.id });
        await logSetup(guildId, "1v1 Log Panel Set Up", `<@${i.user.id}> set up the 1v1 log panel`,
          [
            { name: "Channel", value: `<#${ch.id}>`, inline: true },
            ...(category ? [{ name: "Ticket Category", value: `<#${category.id}>`, inline: true }] : []),
          ],
        );
        return i.editReply({ content: `1v1 log panel sent to <#${ch.id}>${category ? ` — tickets will be created in <#${category.id}>` : ""}` });
      }
      setGuild(guildId, { ticketChannel: ch.id });
      await logSetup(guildId, "Ticket Panel Set Up", `<@${i.user.id}> set up the ticket panel`,
        [{ name: "Type", value: type, inline: true }, { name: "Channel", value: `<#${ch.id}>`, inline: true }],
      );
      return i.editReply({ content: `panel sent to <#${ch.id}>` });
    }

        case "1v1freeze": {
      if (!mgGuild(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const current   = getIsFrozen(guildId);
      setFrozen(guildId, !current);
      const nowFrozen = !current;
      await logSetup(guildId, `1v1 Leaderboard ${nowFrozen ? "Frozen" : "Unfrozen"}`, `<@${i.user.id}> ${nowFrozen ? "froze" : "unfroze"} the 1v1 leaderboard`);
      return i.reply({ content: `1v1 leaderboard is now **${nowFrozen ? "🔒 frozen" : "🔓 unfrozen"}** — ${nowFrozen ? "no new challenges can be made" : "challenges are open again"}` });
    }

        case "1v1logset": {
      if (!mgGuild(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const ch = i.options.getChannel("channel", true) as TextChannel;
      setMatchLogChannel(guildId, ch.id);
      await logSetup(guildId, "1v1 Log Channel Set", `<@${i.user.id}> set the 1v1 log channel to <#${ch.id}>`);
      return i.reply({ content: `1v1 match results and ticket messages going to <#${ch.id}> now` });
    }

    case "logset": {
      if (!mgGuild(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const ch = i.options.getChannel("channel", true) as TextChannel;
      setGuild(guildId, { logChannel: ch.id });
      await logSetup(guildId, "Log Channel Set", `<@${i.user.id}> set the log channel to <#${ch.id}>`);
      return i.reply({ content: `logs going to <#${ch.id}> now` });
    }

    case "taglogset": {
      if (!mgGuild(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const ch = i.options.getChannel("channel", true) as TextChannel;
      setGuild(guildId, { tagLogChannel: ch.id });
      await logSetup(guildId, "Tag Log Channel Set", `<@${i.user.id}> set the tag log channel to <#${ch.id}>`);
      return i.reply({ content: `tag logs going to <#${ch.id}> now` });
    }

    case "botlogset": {
      if (!mgGuild(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const ch = i.options.getChannel("channel", true) as TextChannel;
      setGuild(guildId, { botLogChannel: ch.id });
      await logSetup(guildId, "Bot Log Channel Set", `<@${i.user.id}> set the bot log channel to <#${ch.id}>`);
      return i.reply({ content: `bot activity logs going to <#${ch.id}> now` });
    }

    case "vset": {
      if (!admin(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const role = i.options.getRole("role", true);
      setGuild(guildId, { verificationRole: role.id });
      await logSetup(guildId, "Verification Role Set", `<@${i.user.id}> set the verification role to <@&${role.id}>`);
      return i.reply({ content: `verification role set to <@&${role.id}>` });
    }

    case "gid": {
      if (!admin(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const id = i.options.getString("id", true).trim();
      if (isNaN(Number(id))) return i.reply({ content: "need a valid group id", ephemeral: true });
      setGuild(guildId, { groupId: id });
      await logSetup(guildId, "Group ID Set", `<@${i.user.id}> set the group ID to \`${id}\``);
      return i.reply({ content: `group id set to \`${id}\`\ngroup checks will now use this group` });
    }

    case "prefix": {
      if (!admin(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const p = i.options.getString("prefix", true).trim();
      setGuild(guildId, { prefix: p });
      await logSetup(guildId, "Prefix Changed", `<@${i.user.id}> changed the prefix to \`${p}\``);
      return i.reply({ content: `prefix changed to \`${p}\`` });
    }

    case "setnickname": {
      if (!admin(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const nick = i.options.getString("name") ?? null;
      await i.guild?.members.me?.setNickname(nick).catch(() => {});
      return i.reply({ content: nick ? `nickname set to **${nick}**` : "nickname cleared" });
    }

    case "setusername": {
      if (!isOwner(i)) return i.reply({ content: "only the bot owner can do that", ephemeral: true });
      const name = i.options.getString("name", true).trim();
      await i.deferReply({ ephemeral: true });
      try {
        await i.client.user?.setUsername(name);
        return i.editReply({ content: `username changed to **${name}** — changes may take a moment` });
      } catch (err) {
        return i.editReply({ content: `failed to change username — discord rate limits this heavily` });
      }
    }

    case "setavatar": {
      if (!admin(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const url        = i.options.getString("url") ?? null;
      const attachment = i.options.getAttachment("image") ?? null;
      await i.deferReply();
      try {
        const source = url ?? attachment?.url;
        if (!source) return i.editReply({ content: "provide a url or attach an image" });
        const buf = await fetchImage(source);
        await i.client.user?.setAvatar(buf);
        return i.editReply({ content: "avatar updated" });
      } catch {
        return i.editReply({ content: "failed to update avatar — check the image url and try again" });
      }
    }

    case "setbanner": {
      if (!admin(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const url        = i.options.getString("url") ?? null;
      const attachment = i.options.getAttachment("image") ?? null;
      await i.deferReply();
      try {
        const source = url ?? attachment?.url;
        if (!source) return i.editReply({ content: "provide a url or attach an image" });
        const buf = await fetchImage(source);
        await i.client.user?.setBanner(buf);
        return i.editReply({ content: "banner updated" });
      } catch {
        return i.editReply({ content: "failed to update banner — nitro is required on the bot account" });
      }
    }

    case "setstatus": {
      if (!admin(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const text = i.options.getString("text", true);
      if (text.toLowerCase() === "clear") {
        i.client.user?.setPresence({ activities: [] });
        await logInfo(guildId, "Status Cleared", `<@${i.user.id}> cleared the bot status`);
        return i.reply({ content: "status cleared" });
      }
      i.client.user?.setPresence({ activities: [{ name: text, type: ActivityType.Playing }] });
      await logInfo(guildId, "Status Updated", `<@${i.user.id}> set the bot status to: **${text}**`);
      return i.reply({ content: `status set to **${text}**` });
    }

    case "setpresence": {
      if (!admin(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const status = i.options.getString("status", true) as "online" | "idle" | "dnd" | "invisible";
      i.client.user?.setPresence({ status });
      await logInfo(guildId, "Presence Updated", `<@${i.user.id}> set bot presence to **${status}**`);
      return i.reply({ content: `presence set to **${status}**` });
    }

        case "wl": {
      if (!admin(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const sub = i.options.getSubcommand();
      if (sub === "bot") {
        const t      = i.options.getUser("user", true);
        const wlData = getWhitelist();
        wlData["bot"] = wlData["bot"] ?? [];
        if (wlData["bot"].includes(t.id)) return i.reply({ content: `<@${t.id}> already has full access`, ephemeral: true });
        wlData["bot"].push(t.id);
        setWhitelist(wlData);
        await logSetup(guildId, "Whitelist Updated", `<@${i.user.id}> gave <@${t.id}> full bot access`);
        return i.reply({ content: `<@${t.id}> now has access to all commands` });
      }
      if (sub === "command") {
        const cmdName = i.options.getString("name", true);
        const t       = i.options.getUser("user", true);
        const wlData  = getWhitelist();
        wlData[cmdName] = wlData[cmdName] ?? [];
        if (wlData[cmdName]!.includes(t.id)) return i.reply({ content: `<@${t.id}> can already use \`${cmdName}\``, ephemeral: true });
        wlData[cmdName]!.push(t.id);
        setWhitelist(wlData);
        await logSetup(guildId, "Whitelist Updated", `<@${i.user.id}> gave <@${t.id}> access to \`${cmdName}\``);
        return i.reply({ content: `<@${t.id}> can now use \`${cmdName}\`` });
      }
      return;
    }

        case "wlrole": {
      if (!mgGuild(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const role    = i.options.getRole("role", true);
      const cmdName = i.options.getString("command")?.toLowerCase() ?? null;
      const s       = getGuild(guildId);
      if (!cmdName) {
        const roles = s.tagManagerRoles ?? [];
        if (roles.includes(role.id)) return i.reply({ content: `<@&${role.id}> is already a tag manager role`, ephemeral: true });
        roles.push(role.id);
        setGuild(guildId, { tagManagerRoles: roles });
        await logSetup(guildId, "Role Whitelisted", `<@${i.user.id}> made <@&${role.id}> a tag manager role`);
        return i.reply({ content: `<@&${role.id}> can now manage tag tickets` });
      }
      const commandRoles = s.commandRoles ?? {};
      commandRoles[cmdName] = commandRoles[cmdName] ?? [];
      if (commandRoles[cmdName]!.includes(role.id)) return i.reply({ content: `<@&${role.id}> already has access to \`${cmdName}\``, ephemeral: true });
      commandRoles[cmdName]!.push(role.id);
      setGuild(guildId, { commandRoles });
      await logSetup(guildId, "Role Whitelisted", `<@${i.user.id}> gave <@&${role.id}> access to \`${cmdName}\``);
      return i.reply({ content: `<@&${role.id}> can now use \`${cmdName}\`` });
    }

        case "wlp": {
      if (!admin(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const role = i.options.getRole("role", true);
      const s    = getGuild(guildId);
      if (s.pointsRole === role.id) return i.reply({ content: `<@&${role.id}> already manages points`, ephemeral: true });
      setGuild(guildId, { pointsRole: role.id });
      await logSetup(guildId, "Points Role Set", `<@${i.user.id}> gave <@&${role.id}> full points access`);
      return i.reply({ content: `<@&${role.id}> can now use all raid points commands` });
    }

        case "tmr": {
      if (!admin(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const role = i.options.getRole("role", true);
      setGuild(guildId, { tagManagerRole: role.id });
      await logSetup(guildId, "Tag Manager Role Set", `<@${i.user.id}> set the tag manager role to <@&${role.id}>`);
      return i.reply({ content: `<@&${role.id}> is now the tag manager role — they can use \`/role\`` });
    }

        case "vmr": {
      if (!admin(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const sub  = i.options.getSubcommand();
      const role = i.options.getRole("role");
      const s    = getGuild(guildId);

      if (sub === "list") {
        const roles: string[] = [
          ...(s.verificationManagerRoles ?? []),
          ...(s.verificationManagerRole ? [s.verificationManagerRole] : []),
        ];
        if (roles.length === 0) return i.reply({ content: "no verification manager roles configured yet", ephemeral: true });
        const c = cv2h(WHITE, "Verification Manager Roles", roles.map((id) => `  <@&${id}>`).join("\n"), "◈  vmr");
        return i.reply(send(c) as Parameters<typeof i.reply>[0]);
      }

      if (sub === "remove") {
        if (!role) return i.reply({ content: "select a role to remove", ephemeral: true });
        const current = s.verificationManagerRoles ?? [];
        if (!current.includes(role.id)) return i.reply({ content: `<@&${role.id}> isn't in the VMR list`, ephemeral: true });
        setGuild(guildId, { verificationManagerRoles: current.filter((id) => id !== role.id) });
        await logSetup(guildId, "VMR Role Removed", `<@${i.user.id}> removed <@&${role.id}> from the verification manager roles`);
        return i.reply({ content: `<@&${role.id}> has been removed from the verification manager roles` });
      }

      if (!role) return i.reply({ content: "select a role to add", ephemeral: true });
      const current = s.verificationManagerRoles ?? [];
      if (current.includes(role.id)) return i.reply({ content: `<@&${role.id}> is already a verification manager role`, ephemeral: true });
      current.push(role.id);
      setGuild(guildId, { verificationManagerRoles: current });
      await logSetup(guildId, "VMR Role Added", `<@${i.user.id}> added <@&${role.id}> as a verification manager role`);
      return i.reply({ content: `<@&${role.id}> added to the verification manager roles` });
    }

        case "psr": {
      if (!admin(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const role = i.options.getRole("role", true);
      setGuild(guildId, { pointsSupportRole: role.id });
      await logSetup(guildId, "Points Support Role Set", `<@${i.user.id}> set the points support role to <@&${role.id}>`);
      return i.reply({ content: `<@&${role.id}> is now the points support role` });
    }

        case "whitelisted": {
      if (!admin(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const wlData = getWhitelist();
      const s      = getGuild(guildId);
      const lines: string[] = [];
      for (const k of Object.keys(wlData)) {
        if ((wlData[k] ?? []).length > 0) {
          lines.push(`**\`${k}\`** (users)\n${wlData[k]!.map((id) => `<@${id}>`).join(", ")}`);
        }
      }
      const commandRoles = s.commandRoles ?? {};
      for (const k of Object.keys(commandRoles)) {
        if ((commandRoles[k] ?? []).length > 0) {
          lines.push(`**\`${k}\`** (roles)\n${commandRoles[k]!.map((id) => `<@&${id}>`).join(", ")}`);
        }
      }
      if ((s.tagManagerRoles ?? []).length > 0) lines.push(`**tag manager** (roles)\n${s.tagManagerRoles!.map((id) => `<@&${id}>`).join(", ")}`);
      if (s.tagManagerRole)  lines.push(`**tag manager role** (/tmr)\n<@&${s.tagManagerRole}>`);
      if (s.pointsRole)      lines.push(`**points manager** (role)\n<@&${s.pointsRole}>`);
      if (s.pointsSupportRole) lines.push(`**points support role** (/psr)\n<@&${s.pointsSupportRole}>`);
      if (lines.length === 0) return i.reply({ content: "nothing whitelisted yet", ephemeral: true });
      const c = cv2h(WHITE, "Whitelisted", lines.join("\n\n"), i.guild?.name ?? "");
      return i.reply(send(c) as Parameters<typeof i.reply>[0]);
    }

        case "rankup": {
      if (!hasFullAccess(i, "rankup")) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const target = i.options.getUser("user", true);
      const amount = i.options.getInteger("amount") ?? 1;
      await i.deferReply();
      const pts = getPoints(guildId);
      pts[target.id] = (pts[target.id] ?? 0) + amount;
      savePoints(guildId, pts);
      refreshLeaderboard(i.client, guildId).catch(() => {});
      const { gained } = await syncRankRoles(i.guild!, target.id, pts[target.id] ?? 0, getGuild(guildId).rankRoles ?? []);
      const promotionNote = gained.length > 0 ? `\n**ranks unlocked**  ·  ${gained.join(", ")}` : "";
      await logPoints(guildId, "Points Added",
        `<@${i.user.id}> gave **+${amount}** to <@${target.id}>`,
        [{ name: "New Total", value: `${pts[target.id]} pts`, inline: true }],
      );
      const body = [
        `**+${amount}**  to  <@${target.id}>`,
        `**total**  ·  **${pts[target.id]}** pt${pts[target.id] !== 1 ? "s" : ""}`,
        ...(promotionNote ? [promotionNote] : []),
      ].join("\n");
      return i.editReply(send(cv2h(GREEN, "Points Added", body, `given by ${i.user.username}`)) as Parameters<typeof i.editReply>[0]);
    }

        case "removepoints": {
      if (!hasFullAccess(i, "remove")) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const target = i.options.getUser("user", true);
      const amount = i.options.getInteger("amount") ?? 1;
      await i.deferReply();
      const pts = getPoints(guildId);
      pts[target.id] = Math.max(0, (pts[target.id] ?? 0) - amount);
      savePoints(guildId, pts);
      refreshLeaderboard(i.client, guildId).catch(() => {});
      const { lost } = await syncRankRoles(i.guild!, target.id, pts[target.id] ?? 0, getGuild(guildId).rankRoles ?? []);
      const demotionNote = lost.length > 0 ? `\n**ranks removed**  ·  ${lost.join(", ")}` : "";
      await logPoints(guildId, "Points Removed",
        `<@${i.user.id}> removed **-${amount}** from <@${target.id}>`,
        [{ name: "New Total", value: `${pts[target.id]} pts`, inline: true }],
      );
      const body = [
        `**-${amount}**  from  <@${target.id}>`,
        `**total**  ·  **${pts[target.id]}** pt${pts[target.id] !== 1 ? "s" : ""}`,
        ...(demotionNote ? [demotionNote] : []),
      ].join("\n");
      return i.editReply(send(cv2h(RED, "Points Removed", body, `removed by ${i.user.username}`)) as Parameters<typeof i.editReply>[0]);
    }

        case "resetall": {
      const m = getMember(i);
      const hasAccess = admin(i) || (m && memberHasPointsRole(m, guildId));
      if (!hasAccess) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const confirmBtn = new ButtonBuilder().setCustomId("resetall_confirm").setLabel("reset all points").setStyle(ButtonStyle.Danger);
      const cancelBtn  = new ButtonBuilder().setCustomId("resetall_cancel").setLabel("cancel").setStyle(ButtonStyle.Secondary);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, cancelBtn);
      const c   = cv2h(RED, "Reset All Points",
        "this wipes every point in the server and can't be undone\n\nclick **reset all points** to confirm",
        `requested by ${i.user.username}`);
      await i.reply({ ...send(c, [row]), ephemeral: true } as Parameters<typeof i.reply>[0]);
      const msg = await i.fetchReply();
      const collector = msg.createMessageComponentCollector({ filter: (btn) => btn.user.id === i.user.id, time: 15000 });
      collector.on("collect", async (btn) => {
        if (btn.customId === "resetall_confirm") {
          const { readJSON, writeJSON } = await import("../utils/storage.js");
          const d = readJSON<Record<string, unknown>>("points.json");
          d[guildId] = {};
          writeJSON("points.json", d);
          const rankCfgReset = getGuild(guildId);
          for (const rank of rankCfgReset.rankRoles ?? []) {
            const rankRole = i.guild!.roles.cache.get(rank.roleId);
            if (rankRole) {
              for (const [, roleMember] of rankRole.members) {
                await roleMember.roles.remove(rank.roleId).catch(() => {});
              }
            }
          }
          await logPoints(guildId, "Points Reset", `<@${i.user.id}> wiped all raid points and rank roles in this server`);
          const doneC = cv2h(RED, "Done", `all points and rank roles cleared`, `done by ${i.user.username}`);
          await btn.update({ ...send(doneC), components: send(doneC).components } as never);
        } else {
          const cancelC = cv2h(WHITE, "Cancelled", "nothing changed", "◈  points");
          await btn.update({ ...send(cancelC), components: send(cancelC).components } as never);
        }
        collector.stop();
      });
      collector.on("end", (_, reason) => { if (reason === "time") i.editReply({ components: [] }).catch(() => {}); });
      return;
    }

        case "register": {
      const robloxName = i.options.getString("username", true).trim();
      await i.deferReply({ ephemeral: true });
      const robloxUser = await getUserByUsername(robloxName).catch(() => null);
      if (!robloxUser) return i.editReply({ content: `could not find **${robloxName}** on Roblox — double-check the spelling and try again.` });
      setRegistered(i.user.id, robloxUser.name);
      const body = `**discord**  ·  ${i.user.username}\n**roblox**   ·  ${robloxUser.name}\n\naccount linked — run /register again to update`;
      return i.editReply(send(cv2h(GREEN, "Registered", body, "◈  register")) as Parameters<typeof i.editReply>[0]);
    }

        case "check": {
      const target = i.options.getUser("user");
      const m      = getMember(i);
      if (target && target.id !== i.user.id) {
        if (!hasFullAccess(i, "check") && !(m && memberHasPSR(m, guildId))) {
          return i.reply({ content: "you don't have permission to do that", ephemeral: true });
        }
      }
      const subject = target ?? i.user;
      const pts = getPoints(guildId);
      const p   = pts[subject.id] ?? 0;
      const body = `<@${subject.id}>  ·  **${p}** pt${p !== 1 ? "s" : ""}`;
      return i.reply(send(cv2(WHITE, body, "◈  points")) as Parameters<typeof i.reply>[0]);
    }

        case "leaderboard": {
      const pts   = getPoints(guildId);
      const embed = buildLeaderboardEmbed(pts, i.guild?.name ?? "server");
      if (!embed) return i.reply({ content: "nobody has any points yet. be the first!", ephemeral: true });
      await i.reply(embed as Parameters<typeof i.reply>[0]);
      const msg = await i.fetchReply();
      setGuild(guildId, { leaderboardMessage: { channelId: i.channelId, messageId: msg.id } });
      return;
    }

        case "leaderboardpanel": {
      if (!mgGuild(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      await i.deferReply({ ephemeral: true });
      const ch    = (i.options.getChannel("channel", true)) as import("discord.js").TextChannel;
      const pts   = getPoints(guildId);
      const embed = buildLeaderboardEmbed(pts, i.guild?.name ?? "server");
      if (!embed) return i.editReply({ content: "nobody has any points yet — the leaderboard will appear here once points are awarded." });
      const msg = await ch.send(embed as never);
      setGuild(guildId, { leaderboardMessage: { channelId: ch.id, messageId: msg.id } });
      return i.editReply({ content: `leaderboard panel sent to <#${ch.id}> — it will automatically refresh every 10 minutes.` });
    }

        case "raidpointspanel": {
      if (!mgGuild(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      await i.deferReply({ ephemeral: true });
      const ch  = (i.options.getChannel("channel", true)) as import("discord.js").TextChannel;
      const btn = new ButtonBuilder()
        .setCustomId("raid_point_request")
        .setLabel("Request a Raid Point")
        .setStyle(ButtonStyle.Primary);
      const body = [
        `click the button below to submit a raid point request`,
        `you'll need your roblox username and a screenshot as proof`,
        `staff will review it before points are awarded`,
      ].join("\n");
      const c = cv2h(WHITE, "Raid Points", body, "◈  points  ·  unverified submissions will be denied");
      await ch.send({ ...send(c, [new ActionRowBuilder<ButtonBuilder>().addComponents(btn)]) } as never);
      return i.editReply({ content: `raid point panel sent to <#${ch.id}>.` });
    }

        case "addrank": {
      if (!mgGuild(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const roleId   = i.options.getString("roleid", true).replace(/\D/g, "");
      const points   = i.options.getInteger("points", true);
      const rankName = i.options.getString("name") ?? null;
      if (!roleId) return i.reply({ content: "need a valid role id", ephemeral: true });
      const role = i.guild?.roles.cache.get(roleId);
      if (!role) return i.reply({ content: `couldn't find a role with id \`${roleId}\``, ephemeral: true });
      const s     = getGuild(guildId);
      const ranks = s.rankRoles ?? [];
      if (ranks.length >= 30) return i.reply({ content: "you've hit the 30 rank limit — remove one before adding another", ephemeral: true });
      if (ranks.some((r) => r.roleId === roleId)) return i.reply({ content: `<@&${roleId}> is already configured as a rank`, ephemeral: true });
      ranks.push({ roleId, points, name: rankName ?? role.name });
      setGuild(guildId, { rankRoles: ranks });
      await logSetup(guildId, "Rank Added", `<@${i.user.id}> added rank **${rankName ?? role.name}** at **${points}** pts`);
      return i.reply({ content: `rank added — <@&${roleId}> unlocks at **${points}** points as **${rankName ?? role.name}**` });
    }

        case "removerank": {
      if (!mgGuild(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const roleId = i.options.getString("roleid", true).replace(/\D/g, "");
      const s      = getGuild(guildId);
      const ranks  = s.rankRoles ?? [];
      const idx    = ranks.findIndex((r) => r.roleId === roleId);
      if (idx === -1) return i.reply({ content: `\`${roleId}\` isn't configured as a rank`, ephemeral: true });
      const [removed] = ranks.splice(idx, 1);
      setGuild(guildId, { rankRoles: ranks });
      await logSetup(guildId, "Rank Removed", `<@${i.user.id}> removed rank **${removed!.name}**`);
      return i.reply({ content: `removed **${removed!.name}** from the rank configuration` });
    }

        case "ranks": {
      const s     = getGuild(guildId);
      const ranks = (s.rankRoles ?? []).sort((a, b) => a.points - b.points);
      if (ranks.length === 0) return i.reply({ content: "no ranks configured yet — use `/addrank` to get started", ephemeral: true });
      const lines = ranks.map((r, idx) => `\`${idx + 1}.\`  <@&${r.roleId}>  ·  **${r.points}** pts  ·  \`${r.name}\``);
      const c = cv2h(WHITE, "Configured Ranks", lines.join("\n"), `◈  ranks  ·  ${ranks.length}/30`);
      return i.reply(send(c) as Parameters<typeof i.reply>[0]);
    }

        case "backup": {
      if (!isOwner(i)) return i.reply({ content: "only the bot owner can do that", ephemeral: true });
      const file  = createBackup();
      const att   = new AttachmentBuilder(Buffer.from(JSON.stringify(file, null, 2)), { name: `backup-${Date.now()}.json` });
      return i.reply({ content: "here's your backup — save it somewhere safe.", files: [att], ephemeral: true });
    }

    case "restore": {
      if (!isOwner(i)) return i.reply({ content: "only the bot owner can do that", ephemeral: true });
      const att = i.options.getAttachment("file", true);
      await i.deferReply({ ephemeral: true });
      try {
        const buf = await fetchImage(att.url);
        const json = JSON.parse(buf.toString("utf-8"));
        restoreBackup(json);
        return i.editReply({ content: "backup restored — all settings and data have been replaced with the backup." });
      } catch {
        return i.editReply({ content: "failed to restore — make sure you uploaded a valid backup file." });
      }
    }

        case "blacklist": {
      if (!admin(i) && !isSU(i)) return i.reply({ content: "you don't have permission to manage the blacklist.", ephemeral: true });
      const sub = i.options.getSubcommand();

      if (sub === "add") {
        const username = i.options.getString("username", true).trim();
        const reason   = i.options.getString("reason") ?? "no reason given";
        if (isBlacklisted(username)) return i.reply(send(cv2(RED, `\`${username}\` is already blacklisted`, "◈  blacklist"), []) as Parameters<typeof i.reply>[0]);
        addToBlacklist(username, { reason, addedBy: i.user.username, addedById: i.user.id, addedAt: Date.now() });
        await logSetup(guildId, "Blacklist: User Added", `<@${i.user.id}> blacklisted **${username}** — reason: ${reason}`);
        const body = `**added**   ·  \`${username}\`\n**reason**  ·  ${reason}\n**by**      ·  <@${i.user.id}>`;
        return i.reply({ ...send(cv2h(RED, "Blacklisted", body, "◈  blacklist")), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "remove") {
        const username = i.options.getString("username", true).trim();
        const ok = removeFromBlacklist(username);
        if (!ok) return i.reply({ content: `\`${username}\` isn't on the blacklist`, ephemeral: true });
        await logSetup(guildId, "Blacklist: User Removed", `<@${i.user.id}> removed **${username}** from the blacklist`);
        const body = `**removed**  ·  \`${username}\`\n**by**       ·  <@${i.user.id}>`;
        return i.reply({ ...send(cv2h(GREEN, "Removed", body, "◈  blacklist")), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "check") {
        const username = i.options.getString("username", true).trim();
        const entry    = isBlacklisted(username);
        if (!entry) {
          return i.reply({ ...send(cv2(GREEN, `\`${username}\`  is clean`, "◈  blacklist")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        }
        const body = [
          `\`${username}\`  is blacklisted`,
          `**reason**  ·  ${entry.reason}`,
          `**by**      ·  <@${entry.addedById}>`,
          `**date**    ·  <t:${Math.floor(entry.addedAt / 1000)}:D>`,
        ].join("\n");
        return i.reply({ ...send(cv2h(RED, "Blacklisted", body, "◈  blacklist")), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "list") {
        const bl      = getBlacklist();
        const entries = Object.entries(bl);
        if (entries.length === 0) return i.reply({ ...send(cv2(WHITE, "blacklist is empty", "◈  blacklist")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        const lines = entries.map(([user, e]) => `\`${user}\`  ·  ${e.reason}  ·  <@${e.addedById}>`);
        const pages: string[] = [];
        for (let j = 0; j < lines.length; j += 15) pages.push(lines.slice(j, j + 15).join("\n"));
        await i.reply({ ...send(cv2h(RED, `Blacklist (${entries.length})`, pages[0]!, "◈  blacklist")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        for (let p = 1; p < pages.length; p++) {
          await (i.channel as TextChannel)?.send(send(cv2(RED, pages[p]!, `page ${p + 1}/${pages.length}`)) as never);
        }
        return;
      }

      return i.reply({ content: "unknown subcommand", ephemeral: true });
    }

        case "vanity": {
      if (!admin(i) && !isSU(i)) return i.reply({ content: "you don't have permission to manage the vanity watcher.", ephemeral: true });
      const sub = i.options.getSubcommand();

      if (sub === "flag") {
        const raw = i.options.getString("vanity", true);
        const ok  = addOppVanity(guildId, raw);
        const v   = raw.toLowerCase().replace(/^\//, "");
        if (!ok) return i.reply({ ...send(cv2(RED, `**/${v}** is already on the opp list`, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        await logSetup(guildId, "Vanity Flagged as Opp", `<@${i.user.id}> flagged **/${v}** as an opp vanity.`);
        const body = `**added**  ·  **/${v}**\nmembers repping it will be flagged`;
        return i.reply({ ...send(cv2h(WHITE, "Opp Vanity Added", body, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "unflagvanity") {
        const raw = i.options.getString("vanity", true);
        const ok  = removeOppVanity(guildId, raw);
        const v   = raw.toLowerCase().replace(/^\//, "");
        if (!ok) return i.reply({ ...send(cv2(RED, `**/${v}** isn't on the opp list`, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        const body = `**removed**  ·  **/${v}**`;
        return i.reply({ ...send(cv2h(GREEN, "Removed", body, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "whitelist") {
        const raw = i.options.getString("vanity", true);
        const ok  = addWhitelistedVanity(guildId, raw);
        const v   = raw.toLowerCase().replace(/^\//, "");
        if (!ok) return i.reply({ ...send(cv2(RED, `**/${v}** is already whitelisted`, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        const body = `**whitelisted**  ·  **/${v}**\nmembers repping it won't be flagged`;
        return i.reply({ ...send(cv2h(GREEN, "Whitelisted", body, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "unwhitelist") {
        const raw = i.options.getString("vanity", true);
        const ok  = removeWhitelistedVanity(guildId, raw);
        const v   = raw.toLowerCase().replace(/^\//, "");
        if (!ok) return i.reply({ ...send(cv2(RED, `**/${v}** isn't whitelisted`, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        const body = `**removed from whitelist**  ·  **/${v}**`;
        return i.reply({ ...send(cv2h(GREEN, "Removed", body, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "vanities") {
        const list = getWhitelistedVanities(guildId);
        if (list.length === 0) return i.reply({ ...send(cv2(WHITE, "no whitelisted vanities yet", "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        const body = list.map((v) => `/${v}`).join("\n");
        return i.reply({ ...send(cv2h(WHITE, `Whitelisted (${list.length})`, body, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "opplist") {
        const list = getOppVanities(guildId);
        if (list.length === 0) return i.reply({ ...send(cv2(WHITE, "no opp vanities yet", "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        const body = list.map((v) => `/${v}`).join("\n");
        return i.reply({ ...send(cv2h(RED, `Opp Vanities (${list.length})`, body, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "flagged") {
        const flagged = getFlaggedMembers(guildId);
        const entries = Object.entries(flagged);
        if (entries.length === 0) return i.reply({ ...send(cv2(WHITE, "no flagged members right now", "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        const lines = entries.map(([uid, info]) => `<@${uid}>  ·  /${info.vanity}  ·  <t:${Math.floor(info.flaggedAt / 1000)}:R>`);
        return i.reply({ ...send(cv2h(RED, `Flagged Members (${entries.length})`, lines.join("\n"), "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "unflag") {
        const target = i.options.getUser("user", true);
        const ok = unflagMember(guildId, target.id);
        if (!ok) return i.reply({ ...send(cv2(RED, `<@${target.id}> isn't flagged`, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        const body = `**unflagged**  ·  <@${target.id}>`;
        return i.reply({ ...send(cv2h(GREEN, "Unflagged", body, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "scan") {
        await i.deferReply({ ephemeral: true });
        const count = await scanAllMembers(i.client, guildId);
        const body  = `scan done  ·  **${count}** new member${count !== 1 ? "s" : ""} flagged`;
        return i.editReply(send(cv2h(WHITE, "Scan Complete", body, "◈  vanity")) as Parameters<typeof i.editReply>[0]);
      }

      if (sub === "toggle") {
        const nowEnabled = toggleVanityWatcher(guildId);
        const body = `vanity watcher is now **${nowEnabled ? "enabled" : "disabled"}**`;
        return i.reply({ ...send(cv2(nowEnabled ? GREEN : RED, body)), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "setlog") {
        const channel = i.options.getChannel("channel", true);
        setVanityLogChannel(guildId, channel.id);
        await logSetup(guildId, "Vanity Log Channel Set", `<@${i.user.id}> set the vanity log channel to <#${channel.id}>.`);
        const body = `vanity alerts will now be posted in <#${channel.id}>`;
        return i.reply({ ...send(cv2(GREEN, body)), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "mute") {
        const raw = i.options.getString("vanity", true);
        const v   = raw.toLowerCase().replace(/^\//, "");
        const ok  = addSilentVanity(guildId, raw);
        if (!ok) return i.reply({ ...send(cv2(RED, `**/${v}** is already muted — detections won't ping`, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        await logSetup(guildId, "Vanity Muted", `<@${i.user.id}> muted pings for **/${v}** — still flags, no ping`);
        const body = `**muted**  ·  **/${v}**\ndetections will flag but not ping`;
        return i.reply({ ...send(cv2h(WHITE, "Muted", body, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "unmute") {
        const raw = i.options.getString("vanity", true);
        const v   = raw.toLowerCase().replace(/^\//, "");
        const ok  = removeSilentVanity(guildId, raw);
        if (!ok) return i.reply({ ...send(cv2(RED, `**/${v}** isn't muted`, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        const body = `**unmuted**  ·  **/${v}**\ndetections will ping again`;
        return i.reply({ ...send(cv2h(GREEN, "Unmuted", body, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "mutelist") {
        const list = getSilentVanities(guildId);
        if (list.length === 0) return i.reply({ ...send(cv2(WHITE, "no muted vanities — all detections ping", "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        const body = list.map((v) => `/${v}  ·  no ping`).join("\n");
        return i.reply({ ...send(cv2h(WHITE, `Muted Vanities (${list.length})`, body, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "setpingrole") {
        const role = i.options.getRole("role");
        setVanityPingRole(guildId, role ? role.id : null);
        if (role) {
          await logSetup(guildId, "Vanity Ping Role Set", `<@${i.user.id}> set the vanity ping role to <@&${role.id}>`);
          const body = `**ping role**  ·  <@&${role.id}>\nvanity alerts will now ping this role`;
          return i.reply({ ...send(cv2h(GREEN, "Ping Role Set", body, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        }
        const body = `ping role cleared\nvanity alerts will now use @everyone`;
        return i.reply({ ...send(cv2h(GREEN, "Ping Role Cleared", body, "◈  vanity")), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      return i.reply({ content: "unknown subcommand.", ephemeral: true });
    }

        case "track": {
      const sub = i.options.getSubcommand();

      if (sub === "add") {
        const username = i.options.getString("username", true);
        await i.deferReply({ ephemeral: true });
        const tracks = getTracksForUser(i.user.id);
        if (tracks.length >= MAX_TRACKS) {
          return i.editReply(send(cv2(RED, "you're at the limit  ·  remove someone first", "◈  tracker")) as Parameters<typeof i.editReply>[0]);
        }
        const user = await getUserByUsername(username);
        if (!user) return i.editReply(send(cv2(RED, `no user found  ·  **${username}**`, "◈  tracker")) as Parameters<typeof i.editReply>[0]);
        const result = addTrack(i.user.id, user.id, user.name);
        if (result === "exists") return i.editReply(send(cv2(RED, `you're already tracking  ·  **${user.name}**`, "◈  tracker")) as Parameters<typeof i.editReply>[0]);
        const body = `**tracking**  ·  **${user.name}**\nyou'll get a ping when they hop in a game`;
        return i.editReply(send(cv2h(GREEN, "Now Tracking", body, "◈  tracker")) as Parameters<typeof i.editReply>[0]);
      }

      if (sub === "remove") {
        const username = i.options.getString("username", true);
        const ok = removeTrack(i.user.id, username);
        if (!ok) return i.reply({ ...send(cv2(RED, `**${username}** isn't in your list`, "◈  tracker")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        const body = `**done**  ·  not tracking **${username}** anymore`;
        return i.reply({ ...send(cv2h(GREEN, "Removed", body, "◈  tracker")), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "list") {
        const tracks = getTracksForUser(i.user.id);
        if (tracks.length === 0) return i.reply({ ...send(cv2(WHITE, "you're not tracking anyone yet  ·  try /track add", "◈  tracker")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        const lines = tracks.map((t) => `**${t.robloxUsername}**${t.alertGame ? `  ·  \`${t.alertGame}\`` : ""}`);
        const c = cv2h(WHITE, `Tracking (${tracks.length}/${MAX_TRACKS})`, lines.join("\n"), "◈  tracker");
        return i.reply({ ...send(c), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "check") {
        const username = i.options.getString("username", true);
        await i.deferReply({ ephemeral: true });
        const user = await getUserByUsername(username);
        if (!user) return i.editReply(send(cv2(RED, `no user found  ·  **${username}**`, "◈  tracker")) as Parameters<typeof i.editReply>[0]);

        const presence = await getUserPresence(user.id);
        const avatar   = await getUserAvatarUrl(user.id);

        const statusMap: Record<number, string> = { 0: "offline", 1: "online", 2: "in a game", 3: "in studio" };
        const statusLabel = statusMap[presence?.userPresenceType ?? 0] ?? "unknown";

        let joinUrl: string | null = null;
        let hasSpecificServer = false;
        let gameName: string | null = null;

        if (presence?.userPresenceType === 2 && presence.placeId) {
          gameName = await getGameName(presence.placeId);
          const rawGameId = presence.gameId ?? null;
          hasSpecificServer = rawGameId !== null;
          joinUrl = hasSpecificServer
            ? `https://www.roblox.com/games/start?placeId=${presence.placeId}&gameInstanceId=${rawGameId}`
            : `https://www.roblox.com/games/${presence.placeId}`;
        }

        const lastOnlineMs = presence?.lastOnline ? new Date(presence.lastOnline).getTime() : NaN;
        const lastSeen = (!isNaN(lastOnlineMs) && lastOnlineMs > 0)
          ? `<t:${Math.floor(lastOnlineMs / 1000)}:R>`
          : "unknown";

        const bodyLines = [
          `**status**     ${statusLabel}`,
          ...(gameName ? [`**game**       \`${gameName}\``] : []),
          `**id**         \`${user.id}\``,
          `**last seen**  ${lastSeen}`,
        ];

        const containerC = new ContainerBuilder().setAccentColor(WHITE);
        if (avatar) {
          const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${user.name}  ·  roblox**`))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar));
          containerC.addSectionComponents(section);
          containerC.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        } else {
          containerC.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${user.name}  ·  roblox**`));
          containerC.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        }
        containerC.addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines.join("\n")));
        containerC.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
        containerC.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ◈  tracker`));

        const extraRows: object[] = [];
        if (joinUrl) {
          extraRows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel(hasSpecificServer ? "join server" : "open game")
              .setStyle(hasSpecificServer ? ButtonStyle.Success : ButtonStyle.Secondary)
              .setURL(joinUrl),
          ));
        }

        return i.editReply({ components: [containerC, ...extraRows], flags: MessageFlags.IsComponentsV2 } as Parameters<typeof i.editReply>[0]);
      }

      if (sub === "alert") {
        const username = i.options.getString("username", true);
        const game     = i.options.getString("game") ?? null;
        const tracks   = getTracksForUser(i.user.id);
        const match    = tracks.find((t) => t.robloxUsername.toLowerCase() === username.toLowerCase());
        if (!match) return i.reply({ ...send(cv2(RED, `**${username}** isn't in your tracking list`, "◈  tracker")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        setTrackAlert(i.user.id, match.robloxUserId, game);
        if (game) {
          const body = `**filter set**  ·  **${username}**\nonly notifying for  ·  \`${game}\``;
          return i.reply({ ...send(cv2h(GREEN, "Alert Set", body, "◈  tracker")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        }
        const body = `**filter cleared**  ·  **${username}**\nyou'll get alerts for any game they join`;
        return i.reply({ ...send(cv2h(GREEN, "Filter Cleared", body, "◈  tracker")), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "settings") {
        const dmOnJoin = i.options.getBoolean("dm_on_join");
        if (dmOnJoin !== null) setDmOnJoin(i.user.id, dmOnJoin);
        const current          = getDmOnJoin(i.user.id);
        const notifyChannelId  = getNotifyChannelId(i.user.id);
        const body = [
          `**dms**           ${current ? "on" : "off"}`,
          `**alerts go to**  ${notifyChannelId ? `<#${notifyChannelId}>` : "your dms"}`,
          `**max tracks**    ${MAX_TRACKS}`,
        ].join("\n");
        return i.reply({ ...send(cv2h(WHITE, "Tracker Settings", body, "◈  tracker  ·  use /track notify to change where alerts go")), ephemeral: true } as Parameters<typeof i.reply>[0]);
      }

      if (sub === "notify") {
        const channel = i.options.getChannel("channel");
        if (channel) {
          setNotifyChannelId(i.user.id, channel.id);
          const body = `**alerts going to**  ·  <#${channel.id}>`;
          return i.reply({ ...send(cv2h(GREEN, "Notify Channel Set", body, "◈  tracker")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        } else {
          setNotifyChannelId(i.user.id, null);
          const body = `**alerts going to**  ·  your dms`;
          return i.reply({ ...send(cv2h(GREEN, "Notify Channel Cleared", body, "◈  tracker")), ephemeral: true } as Parameters<typeof i.reply>[0]);
        }
      }

      return i.reply({ content: "unknown subcommand.", ephemeral: true });
    }

        case "accept": {
      if (!canManageGroup(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      const username = i.options.getString("username", true).trim();
      await i.deferReply();
      const user = await getUserByUsername(username);
      if (!user) return i.editReply({ content: `couldn't find **${username}** on roblox` });
      const s       = getGuild(guildId);
      const groupId = s.groupId;
      if (!groupId) return i.editReply({ content: "no group id configured — run `/gid` first" });
      const result = await acceptJoinRequest(groupId, user.id);
      if (!result.ok) {
        const body = `**failed to accept**  ·  **${user.name}**\n**reason**  ·  ${result.reason ?? "unknown"}`;
        return i.editReply(send(cv2h(RED, "Failed", body, "◈  group")) as Parameters<typeof i.editReply>[0]);
      }
      await logCommand(guildId, "Accept Join Request",
        `<@${i.user.id}> accepted **${user.name}** (\`${user.id}\`) into group \`${groupId}\``,
        [{ name: "Roblox", value: user.name, inline: true }, { name: "ID", value: String(user.id), inline: true }],
      );
      const body = [
        `**accepted**  ·  **${user.name}**`,
        `**id**        ·  \`${user.id}\``,
        `**group**     ·  \`${groupId}\``,
      ].join("\n");
      return i.editReply(send(cv2h(GREEN, "Accepted", body, `accepted by ${i.user.username}`)) as Parameters<typeof i.editReply>[0]);
    }

        case "pending": {
      if (!canManageGroup(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      await i.deferReply();
      const s       = getGuild(guildId);
      const groupId = s.groupId;
      if (!groupId) return i.editReply({ content: "no group id configured — run `/gid` first" });
      const requests = await getPendingJoinRequests(groupId);
      if (requests.length === 0) {
        const body = `no pending requests for group \`${groupId}\``;
        return i.editReply(send(cv2h(WHITE, "No Pending Requests", body, "◈  group")) as Parameters<typeof i.editReply>[0]);
      }
      const lines = requests.map((r, idx) => `\`${idx + 1}.\`  **${r.username}**  ·  \`${r.userId}\``);
      const MAX = 1800;
      const pages: string[] = [];
      let cur = "";
      for (const line of lines) {
        const next = cur ? cur + "\n" + line : line;
        if (next.length > MAX) { pages.push(cur); cur = line; } else { cur = next; }
      }
      if (cur) pages.push(cur);
      await i.editReply(send(cv2h(WHITE, `Pending Requests (${requests.length})`, pages[0]!, `◈  group ${groupId}${pages.length > 1 ? `  ·  page 1/${pages.length}` : ""}`)) as Parameters<typeof i.editReply>[0]);
      for (let p = 1; p < pages.length; p++) {
        await (i.channel as TextChannel)?.send(send(cv2(WHITE, pages[p]!, `page ${p + 1}/${pages.length}`)) as never);
      }
      return;
    }

        case "1v1": {
      return handle1v1Set(i);
    }
    case "challenge":     return handleChallengeCommand(i);
    case "1v1logpanel": {
      if (!mgGuild(i)) return i.reply({ content: "you don't have permission to do that", ephemeral: true });
      await i.deferReply({ ephemeral: true });
      const ch = i.options.getChannel("channel", true) as TextChannel;
      await sendLogPanel(ch, guildId);
      return i.editReply({ content: `log panel sent to <#${ch.id}>` });
    }
    case "loground":      return handleLogRound(i);
    case "1v1history":    return handleHistory(i);
    case "1v1stats":      return handleStats(i);
    case "1v1top":        return handleTop(i);

    default:
      return i.reply({ content: "unknown command", ephemeral: true });
  }
}
