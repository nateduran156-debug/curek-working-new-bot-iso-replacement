import {
  ActivityType, ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits, SectionBuilder, ThumbnailBuilder,
  type Client, type Message, type GuildMember, type TextChannel, type Guild,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } from "discord.js";
import {
  getGuild, setGuild, getWhitelist, setWhitelist, getPoints, savePoints,
  memberHasCommandRole, memberHasPointsRole, memberHasTagManagerRole, memberHasPSR,
  memberHasVerificationManagerRole,
  removeVerified, setVerified, createBackup, restoreBackup, readJSON, writeJSON, setRegistered, getRegistered,
} from "../utils/storage.js";
import { startQueue, endQueue, isQueueActive, getQueueLog, addJoiner, setQueuePoints, getQueuePoints } from "../utils/queue.js";
import { getUserByUsername, getUserGroups, isInGroup, getGroupInfo, getGroupInfoBatch, getGroupRank, giveRobloxTagRole, getUserAvatarUrl, getPendingJoinRequests, acceptJoinRequest, getGroupRoles, setGroupRank, getGroupMembersByRole } from "../utils/roblox.js";
import { buildLeaderboardEmbed, refreshLeaderboard } from "../utils/leaderboard.js";
import { buildHelpMessage } from "../utils/help.js";
import { sendTicketPanel, handleTagManagerMessage, closeTicketByMessage } from "../handlers/ticketHandler.js";
import { logCommand, logPoints, logSetup, logInfo, logError } from "../utils/botLogger.js";


function _cv2(color: number, body: string, footer?: string) {
  const c = new ContainerBuilder().setAccentColor(color);
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  if (footer) {
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer}`));
  }
  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}
function _cv2h(color: number, header: string, body: string, footer?: string) {
  const c = new ContainerBuilder().setAccentColor(color);
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${header}**`));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  if (footer) {
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer}`));
  }
  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

const WHITE    = 0xffffff;
const GREEN    = 0x00cc55;
const RED      = 0xff3333;
const OWNER_IDS = new Set(["1472482602215538779", "1456824205545967713", "1490246846583537787"]);

// these are always shown in .flist regardless of what each server has configured
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

const COMMAND_USAGE: Record<string, { desc: string; syntax: string; example?: string }> = {
  sr:              { desc: "Add a custom tag option for this server.",            syntax: "sr <tag name>",                                  example: "sr veteran" },
  role:            { desc: "Give a Roblox tag role to a user.",                   syntax: "role <roblox username> <tag>",                    example: "role fe3murs rockstar" },
  setupticket:     { desc: "Send a ticket panel to a channel.",                   syntax: "setupticket #channel [verification|tag|both]",    example: "setupticket #tickets both" },
  logset:          { desc: "Set the server log channel.",                         syntax: "logset #channel",                                 example: "logset #logs" },
  taglogset:       { desc: "Set the tag log channel.",                            syntax: "taglogset #channel",                              example: "taglogset #tag-logs" },
  botlogset:       { desc: "Set the bot activity log channel.",                   syntax: "botlogset #channel",                              example: "botlogset #bot-logs" },
  vset:            { desc: "Set the role given to verified members.",             syntax: "vset @role",                                      example: "vset @Verified" },
  gid:             { desc: "Set the Roblox group ID for this server.",            syntax: "gid <group id>",                                  example: "gid 703716156" },
  prefix:          { desc: "Change the bot's command prefix.",                    syntax: "prefix <new prefix>",                             example: "prefix !" },
  flag:            { desc: "Flag a Roblox group as suspicious.",                  syntax: "flag <group id>",                                 example: "flag 650907997" },
  unflag:          { desc: "Remove a group from the flag list.",                  syntax: "unflag <group id>",                               example: "unflag 650907997" },
  gc:              { desc: "Check a user's Roblox group memberships.",            syntax: "gc <roblox username>",                            example: "gc fe3murs" },
  verify:          { desc: "Manually verify a Discord user.",                     syntax: "verify @user [roblox username]",                  example: "verify @fe3murs fe3murs" },
  unverify:        { desc: "Remove verification from a Discord user.",            syntax: "unverify @user",                                  example: "unverify @fe3murs" },
  wl:              { desc: "Whitelist a user for bot or command access.",         syntax: "wl bot @user  —or—  wl command <name> @user",    example: "wl bot @fe3murs" },
  wlrole:          { desc: "Give a role access to a command.",                    syntax: "wlrole @role [command]",                          example: "wlrole @Mods role" },
  wlp:             { desc: "Set the points manager role.",                        syntax: "wlp @role",                                       example: "wlp @Staff" },
  tmr:             { desc: "Set the tag manager role.",                           syntax: "tmr @role",                                       example: "tmr @TagManagers" },
  vmr:             { desc: "Add, remove, or list verification manager roles.",   syntax: "vmr @role  |  vmr remove @role  |  vmr list",     example: "vmr @Staff" },
  psr:             { desc: "Set the points support role.",                        syntax: "psr @role",                                       example: "psr @Support" },
  register:        { desc: "Link your Discord to a Roblox account.",             syntax: "register <roblox username>",                      example: "register fe3murs" },
  rankup:          { desc: "Give raid points to a user.",                         syntax: "rankup [amount] @user",                           example: "rankup 3 @fe3murs" },
  remove:          { desc: "Remove raid points from a user.",                     syntax: "remove [amount] @user",                           example: "remove 2 @fe3murs" },
  check:           { desc: "Check a user's raid point total.",                   syntax: "check [@user]",                                   example: "check @fe3murs" },
  status:          { desc: "Set the bot's playing status.",                       syntax: "status <text>  —or—  status clear",               example: "status raiding" },
  presence:        { desc: "Set the bot's online presence.",                      syntax: "presence <online|idle|dnd|invisible>",            example: "presence idle" },
  setavatar:       { desc: "Change the bot's profile picture.",                   syntax: "setavatar [url]  (or attach an image)",           example: "setavatar https://i.imgur.com/abc.png" },
  setpfp:          { desc: "Change the bot's profile picture.",                   syntax: "setpfp [url]  (or attach an image)",              example: "setpfp https://i.imgur.com/abc.png" },
  setbanner:       { desc: "Change the bot's banner (requires Nitro).",           syntax: "setbanner [url]  (or attach an image)",           example: "setbanner https://i.imgur.com/abc.png" },
  setusername:     { desc: "Change the bot's username.",                          syntax: "setusername <new name>",                          example: "setusername x2kbot" },
  setnickname:     { desc: "Change the bot's nickname in this server.",           syntax: "setnickname [name]  (blank to clear)",            example: "setnickname x2k" },
  setnick:         { desc: "Change the bot's nickname in this server.",           syntax: "setnick [name]  (blank to clear)",                example: "setnick x2k" },
  addrank:         { desc: "Add a rank reward unlocked by raid points.",          syntax: "addrank <roleId> <points> [name]",                example: "addrank 123456789 10 Private" },
  removerank:      { desc: "Remove a rank reward.",                               syntax: "removerank <roleId>",                             example: "removerank 123456789" },
  approve:         { desc: "Add a Roblox group to the approved list.",            syntax: "approve <group id>",                              example: "approve 703716156" },
  accept:          { desc: "Accept a pending Roblox group join request.",         syntax: "accept <roblox user> <group name or id>",         example: "accept fe3murs x2k" },
  queuepoints:     { desc: "Set how many points each queue join awards.",         syntax: "queuepoints <number>",                            example: "queuepoints 2" },
  setqueuechannel: { desc: "Set the channel where queue results are posted.",     syntax: "setqueuechannel #channel",                        example: "setqueuechannel #raid-queue" },
  leaveserver:     { desc: "Make the bot leave a server (owner only).",           syntax: "leaveserver <server id>",                         example: "leaveserver 123456789" },
  vmrremove:       { desc: "Remove a role from the verification manager list.",   syntax: "vmr remove @role",                                example: "vmr remove @Staff" },
};

function _usage(cmd: string, prefix: string, extra?: string) {
  const key  = cmd.toLowerCase();
  const info = COMMAND_USAGE[key];
  if (!info) return _cv2(WHITE, `\`${prefix}${cmd}\` — no usage info available`, "◈  usage");
  const lines = [
    info.desc,
    ``,
    `**Syntax:**  \`${prefix}${info.syntax}\``,
    ...(info.example ? [`**Example:** \`${prefix}${info.example}\``] : []),
    ...(extra ? [``, extra] : []),
  ].join("\n");
  return _cv2h(WHITE, cmd, lines, "◈  usage");
}

function ts() { return new Date().toISOString(); }

function hasFullAccess(member: GuildMember, guildId: string, wl: Record<string, string[]>, cmd: string): boolean {
  return (
    OWNER_IDS.has(member.id) ||
    (wl["bot"] ?? []).includes(member.id) ||
    (wl[cmd] ?? []).includes(member.id) ||
    memberHasCommandRole(member, guildId, cmd) ||
    memberHasPointsRole(member, guildId) ||
    memberHasPSR(member, guildId)
  );
}

async function fetchImage(urlOrAttachment: string): Promise<Buffer> {
  const res = await fetch(urlOrAttachment);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export function registerMessageCreate(client: Client) {
  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const member   = message.member as GuildMember;
    const settings = getGuild(message.guild.id);
    const PREFIX   = settings.prefix ?? ".";

    await handleTagManagerMessage(message).catch(() => {});

    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd  = args.shift()?.toLowerCase();
    if (!cmd) return;

    try {
      await dispatch(cmd, args, message, member, client);
    } catch (err) {
      console.error(`[prefix:${cmd}]`, err);
      await logError(message.guild.id, `Command Error: .${cmd}`,
        `something went wrong when <@${message.author.id}> ran \`.${cmd}\``,
        [{ name: "Error", value: String(err).slice(0, 1000) }],
      );
      await message.reply("something went wrong on my end — try again in a moment").catch(() => {});
    }
  });
}

import { syncRankRoles } from "../utils/ranks.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dispatch(cmd: string, args: string[], message: Message, member: GuildMember, client: Client): Promise<any> {
  const guildId = message.guild!.id;
  const wl      = getWhitelist();
  const isSU    = () => OWNER_IDS.has(member.id) || (wl["bot"] ?? []).includes(member.id);
  const admin   = () => isSU();
  const mgGuild = () => isSU();
  const mgRoles = () => isSU();

  switch (cmd) {

    case "sr": {
      if (!admin()) return message.reply("you're not authorized to use that command");
      const name = args[0]?.toLowerCase().trim();
      if (!name) return message.reply(_usage("sr", PREFIX));
      const s        = getGuild(guildId);
      const existing = s.customTags ?? [];
      if (existing.includes(name)) return message.reply(`\`${name}\` is already a tag option`);
      existing.push(name);
      setGuild(guildId, { customTags: existing });
      return message.reply(`tag option \`${name}\` added — it can now be used with \`.role\``);
    }

    case "role": {
      if (!admin() && !memberHasTagManagerRole(member, guildId)) return message.reply("you're not authorized to use that command");

      const s          = getGuild(guildId);
      const customTags = s.customTags ?? [];
      const STATIC_TAGS = ["sharingan tag", "rockstar", "dark", "faze", "fraid", "member"];
      const ALL_TAGS    = [...STATIC_TAGS, ...customTags.map((t) => t.toLowerCase())];

      const username = args[0];
      const tagInput = args.slice(1).join(" ").toLowerCase();

      if (!username || !tagInput) {
        const available = ALL_TAGS.length > 0 ? ALL_TAGS.map((t) => `\`${t}\``).join(", ") : "none — use .sr to add one";
        return message.reply(_usage("role", PREFIX, `**Available tags:** ${available}`));
      }
      if (!ALL_TAGS.includes(tagInput)) {
        const available = ALL_TAGS.length > 0 ? ALL_TAGS.map((t) => `\`${t}\``).join(", ") : "none — use .sr to add one";
        return message.reply(`\`${tagInput}\` is not a valid tag. available tags: ${available}`);
      }

      const loading = await message.reply(`looking up **${username}**...`);
      const user    = await getUserByUsername(username);
      if (!user) return loading.edit({ content: `can't find **${username}** on roblox` });

      const rankInfo    = s.groupId ? await getGroupRank(user.id, s.groupId).catch(() => null) : null;
      const currentRank = rankInfo ? `${rankInfo.rankName} (rank ${rankInfo.rankId})` : "not in group";

      let robloxNote = "";
      const result = await giveRobloxTagRole(username, tagInput, customTags);
      robloxNote = result.ok
        ? `roblox role **${tagInput}** assigned`
        : `roblox role failed: ${result.reason}`;

      await loading.edit(_cv2h(WHITE, "Tag Given", [`**${user.name}**`, `rank: ${currentRank}`, `tag: \`${tagInput}\``, robloxNote].filter(Boolean).join("\n"), `given by ${message.author.username}`));

      const logChannelId = s.tagLogChannel ?? s.logChannel;
      if (logChannelId) {
        const logChannel = message.guild!.channels.cache.get(logChannelId) as TextChannel | undefined;
        if (logChannel) {
          await logChannel.send(_cv2h(WHITE, "Tag Given", [`**roblox**  ·  ${user.name}`, `**given by**  ·  <@${message.author.id}>`, `**tag**  ·  \`${tagInput}\``, rankInfo ? `**prev rank**  ·  ${rankInfo.rankName}` : null].filter(Boolean).join("\n"))).catch(() => {});
        }
      }

      await logCommand(guildId, "Command: .role",
        `<@${message.author.id}> gave tag \`${tagInput}\` to **${user.name}**`,
        [{ name: "Roblox", value: user.name, inline: true }, { name: "Tag", value: tagInput, inline: true }],
      );
      return;
    }

    case "setupticket": {
      if (!mgGuild()) return message.reply("you're not authorized to use that command");
      const channels = message.mentions.channels;
      const type = (args.find((a) => ["verification", "tag", "both"].includes(a)) ?? "both") as "verification" | "tag" | "both";
      if (channels.size === 0) return message.reply(_usage("setupticket", PREFIX));
      for (const [, ch] of channels) {
        await sendTicketPanel(ch as TextChannel, type);
        setGuild(guildId, { ticketChannel: ch.id });
      }
      await logSetup(guildId, "Ticket Panel Set Up",
        `<@${message.author.id}> set up the ticket panel`,
        [{ name: "Type", value: type, inline: true }, { name: "Channel", value: `<#${channels.first()?.id}>`, inline: true }],
      );
      return message.reply(`panel sent to ${[...channels.values()].map((c) => `<#${c.id}>`).join(", ")}`);
    }

    case "logset": {
      if (!mgGuild()) return message.reply("you're not authorized to use that command");
      const ch = message.mentions.channels.first() ?? message.channel;
      setGuild(guildId, { logChannel: (ch as TextChannel).id });
      await logSetup(guildId, "Log Channel Set", `<@${message.author.id}> set the log channel to <#${ch.id}>`);
      return message.reply(`logs going to <#${ch.id}> now`);
    }

    case "taglogset": {
      if (!mgGuild()) return message.reply("you're not authorized to use that command");
      const ch = message.mentions.channels.first() ?? message.channel;
      setGuild(guildId, { tagLogChannel: (ch as TextChannel).id });
      await logSetup(guildId, "Tag Log Channel Set", `<@${message.author.id}> set the tag log channel to <#${ch.id}>`);
      return message.reply(`tag logs going to <#${ch.id}> now`);
    }

    case "botlogset": {
      if (!admin()) return message.reply("you're not authorized to use that command");
      const ch = message.mentions.channels.first() ?? message.channel;
      setGuild(guildId, { botLogChannel: (ch as TextChannel).id });
      await logInfo(guildId, "Bot Log Channel Set",
        `<@${message.author.id}> set this channel as the bot log channel. all bot activity will be logged here.`,
      );
      return message.reply(`bot logs going to <#${ch.id}> now`);
    }

    case "vset": {
      if (!mgGuild()) return message.reply("you're not authorized to use that command");
      const role = message.mentions.roles.first();
      if (!role) return message.reply(_usage("vset", PREFIX));
      setGuild(guildId, { verificationRole: role.id });
      await logSetup(guildId, "Verification Role Set", `<@${message.author.id}> set the verification role to <@&${role.id}>`);
      return message.reply(`verification role is now <@&${role.id}>`);
    }

    case "gid": {
      if (!mgGuild()) return message.reply("you're not authorized to use that command");
      const groupId = args[0];
      if (!groupId || isNaN(Number(groupId))) return message.reply(_usage("gid", PREFIX));
      setGuild(guildId, { groupId });
      await logSetup(guildId, "Group ID Set", `<@${message.author.id}> set the group ID to \`${groupId}\``);
      return message.reply(`group id set to \`${groupId}\``);
    }

    case "prefix": {
      if (!admin()) return message.reply("you're not authorized to use that command");
      const newPrefix = args[0];
      if (!newPrefix) return message.reply(_usage("prefix", PREFIX));
      if (newPrefix.length > 5) return message.reply("keep it under 5 characters");
      setGuild(guildId, { prefix: newPrefix });
      await logSetup(guildId, "Prefix Changed", `<@${message.author.id}> changed the prefix to \`${newPrefix}\``);
      return message.reply(`prefix is now \`${newPrefix}\``);
    }

    case "flag": {
      if (!mgGuild()) return message.reply("you're not authorized to use that command");
      const gid = args[0];
      if (!gid || isNaN(Number(gid))) return message.reply(_usage("flag", PREFIX));
      if (ALWAYS_FLAGGED_IDS.has(gid)) return message.reply(`\`${gid}\` is already in the global flag list`);
      const s       = getGuild(guildId);
      const flagged = s.flaggedGroups ?? [];
      if (flagged.includes(gid)) return message.reply(`\`${gid}\` is already flagged`);
      flagged.push(gid);
      const info       = await getGroupInfo(gid).catch(() => null);
      const groupNames = s.groupNames ?? {};
      if (info?.name) groupNames[String(gid)] = info.name;
      setGuild(guildId, { flaggedGroups: flagged, groupNames });
      await logSetup(guildId, "Group Flagged", `<@${message.author.id}> flagged **${info?.name ?? gid}** (\`${gid}\`)`);
      return message.reply(`flagged **${info?.name ?? gid}** (\`${gid}\`)`);
    }

    case "unflag": {
      if (!mgGuild()) return message.reply("you're not authorized to use that command");
      const gid = args[0];
      if (!gid) return message.reply(_usage("unflag", PREFIX));
      if (ALWAYS_FLAGGED_IDS.has(gid)) return message.reply(`\`${gid}\` is in the global list and can't be unflagged`);
      const s       = getGuild(guildId);
      const flagged = s.flaggedGroups ?? [];
      if (!flagged.includes(gid)) return message.reply(`\`${gid}\` isn't on the list`);
      setGuild(guildId, { flaggedGroups: flagged.filter((g) => g !== gid) });
      await logSetup(guildId, "Group Unflagged", `<@${message.author.id}> unflagged group \`${gid}\``);
      return message.reply(`unflagged \`${gid}\``);
    }

    case "flist": {
      const s      = getGuild(guildId);
      const custom = s.flaggedGroups ?? [];

      // merge always-flagged + guild custom, no duplicates
      const alwaysIds = ALWAYS_FLAGGED.map((g) => g.id);
      const combined  = [...new Set([...alwaysIds, ...custom])];

      const loading     = await message.reply("pulling group info...");
      const apiMap      = await getGroupInfoBatch(combined);
      const storedNames = s.groupNames ?? {};

      const lines = combined.map((id, i) => {
        const name = apiMap[id] ?? ALWAYS_FLAGGED_MAP[id] ?? storedNames[id] ?? "Unknown Group";
        // format: number. [Name](link)  |  `id`
        return `\`${i + 1}.\` [${name}](https://www.roblox.com/groups/${id}) \`${id}\``;
      });

      // chunk into pages in case theres a ton of groups
      const MAX = 4000;
      const pages: string[] = [];
      let cur = "";
      for (const line of lines) {
        const next = cur ? cur + "\n" + line : line;
        if (next.length > MAX) { pages.push(cur); cur = line; } else { cur = next; }
      }
      if (cur) pages.push(cur);

      // FIX: was `flagged.length` (undefined) — now correctly uses `combined.length`
      await loading.edit({
        content: null,
        ..._cv2h(WHITE, `Flagged Groups (${combined.length})`, pages[0]!, "◈  flagged groups"),
      });
      for (let p = 1; p < pages.length; p++) {
        await (message.channel as TextChannel).send(_cv2(WHITE, pages[p]!, `page ${p + 1}/${pages.length}`));
      }
      return;
    }

    case "gc": {
      const username = args[0];
      if (!username) { await message.reply(_usage("gc", PREFIX)); return; }
      const loading  = await message.reply(`checking **${username}**...`);
      const user     = await getUserByUsername(username);
      if (!user) return loading.edit({ content: `couldn't find **${username}** on Roblox` });

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
      const embedColor = isFlagged ? RED : inGroup ? GREEN : WHITE;
      const profileUrl = `https://www.roblox.com/users/${user.id}/profile`;

      // Build paginated group list — 25 per page
      const PAGE_SIZE = 25;
      const groupLines = groups.length > 0
        ? groups.map((g) => `• [${g.group.name}](https://www.roblox.com/groups/${g.group.id})`)
        : ["• none"];

      const pages: string[] = [];
      for (let i = 0; i < groupLines.length; i += PAGE_SIZE) {
        pages.push(groupLines.slice(i, i + PAGE_SIZE).join("\n"));
      }
      if (pages.length === 0) pages.push("• none");

      const totalPages = pages.length;
      let currentPage  = 0;

      function buildGcEmbeds(page: number): { components: object[]; flags: number } {
        const components: object[] = [];
        const mainC = new ContainerBuilder().setAccentColor(embedColor);
        const header = `**[${user!.name}](${profileUrl})**  ·  **Groups (${groups.length})** — page ${page + 1}/${totalPages}`;
        if (avatarUrl) {
          mainC.addSectionComponents(new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(header)).setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl)));
          mainC.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        } else {
          mainC.addTextDisplayComponents(new TextDisplayBuilder().setContent(header));
          mainC.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        }
        mainC.addTextDisplayComponents(new TextDisplayBuilder().setContent(pages[page]!));
        components.push(mainC);
        if (isFlagged) {
          const fc = new ContainerBuilder().setAccentColor(RED);
          fc.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**⚠️  Not Cleared**`));
          fc.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
          fc.addTextDisplayComponents(new TextDisplayBuilder().setContent(`ask **${user!.name}** to leave:\n${flaggedHits.map((m) => `• [${m.group.name}](https://www.roblox.com/groups/${m.group.id})`).join("\n")}`));
          components.push(fc);
        }
        const gc = new ContainerBuilder().setAccentColor(embedColor);
        gc.addTextDisplayComponents(new TextDisplayBuilder().setContent(inGroup ? `✓ **[${user!.name}](${profileUrl})** is in the group\n\n**Group ID:** \`${groupId}\`\n**Link:** [Join Here](https://www.roblox.com/communities/${groupId})` : `✗ **[${user!.name}](${profileUrl})** is not in the group\n\n**Group ID:** \`${groupId}\`\n**Link:** [Join Here](https://www.roblox.com/communities/${groupId})`));
        components.push(gc);
        return { components: components as object[], flags: MessageFlags.IsComponentsV2 };
      }

      function buildNavRow(page: number): ActionRowBuilder<ButtonBuilder> | null {
        if (totalPages <= 1) return null;
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("gc_prev")
            .setLabel("<")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId("gc_next")
            .setLabel(">")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1),
        );
      }

      const navRow = buildNavRow(currentPage);
      const gcResult = buildGcEmbeds(currentPage);
      const gcMsg = await loading.edit({
        content: null,
        components: [...(gcResult.components as never[]), ...(navRow ? [navRow] : [])],
        flags: gcResult.flags,
      });

      if (totalPages <= 1) return;

      const collector = gcMsg.createMessageComponentCollector({
        filter: (i) => i.user.id === message.author.id && (i.customId === "gc_prev" || i.customId === "gc_next"),
        time: 120_000,
      });

      collector.on("collect", async (i) => {
        if (i.customId === "gc_prev" && currentPage > 0) currentPage--;
        else if (i.customId === "gc_next" && currentPage < totalPages - 1) currentPage++;
        const updatedRow = buildNavRow(currentPage);
        const updated = buildGcEmbeds(currentPage); await i.update({ components: [...(updated.components as never[]), ...(updatedRow ? [updatedRow] : [])], flags: updated.flags } as never);
      });

      collector.on("end", () => {
        gcMsg.edit({ components: [] }).catch(() => {});
      });

      return;
    }

    case "verify": {
      if (!mgRoles()) return message.reply("you're not authorized to use that command");
      const target     = message.mentions.members?.first();
      if (!target) return message.reply(_usage("verify", PREFIX));
      const robloxName = args[1] ?? null;
      const s          = getGuild(guildId);
      if (!s.verificationRole) return message.reply("no verification role set — run `.vset @role` first");
      await target.roles.add(s.verificationRole).catch(() => {});
      await target.roles.remove("1493486362165252177").catch(() => {});
      if (robloxName) setVerified(target.id, robloxName);
      await logCommand(guildId, "Manual Verify",
        `<@${message.author.id}> verified <@${target.id}>${robloxName ? ` as **${robloxName}**` : ""}`,
        [{ name: "User", value: `<@${target.id}>`, inline: true }, { name: "Roblox", value: robloxName ?? "N/A", inline: true }],
      );
      return message.reply(`verified <@${target.id}>${robloxName ? ` as **${robloxName}**` : ""}`);
    }

    case "unverify": {
      if (!mgRoles()) return message.reply("you're not authorized to use that command");
      const target = message.mentions.members?.first();
      if (!target) return message.reply(_usage("unverify", PREFIX));
      const s = getGuild(guildId);
      if (s.verificationRole) await target.roles.remove(s.verificationRole).catch(() => {});
      removeVerified(target.id);
      await logCommand(guildId, "Manual Unverify", `<@${message.author.id}> unverified <@${target.id}>`);
      return message.reply(`removed verification from <@${target.id}>`);
    }

    case "wl": {
      if (!admin()) return message.reply("you're not authorized to use that command");
      const sub = args[0];
      if (sub === "bot") {
        const t = message.mentions.users.first();
        if (!t) return message.reply("mention the user you want to whitelist");
        const wlData  = getWhitelist();
        wlData["bot"] = wlData["bot"] ?? [];
        if (wlData["bot"].includes(t.id)) return message.reply(`<@${t.id}> already has full access`);
        wlData["bot"].push(t.id);
        setWhitelist(wlData);
        await logSetup(guildId, "Whitelist Updated", `<@${message.author.id}> gave <@${t.id}> full bot access`);
        return message.reply(`<@${t.id}> now has access to all commands`);
      }
      if (sub === "command") {
        const cmdName = args[1];
        const t       = message.mentions.users.first();
        if (!cmdName || !t) return message.reply(_usage("wl", PREFIX));
        const wlData    = getWhitelist();
        wlData[cmdName] = wlData[cmdName] ?? [];
        if (wlData[cmdName]!.includes(t.id)) return message.reply(`<@${t.id}> can already use \`.${cmdName}\``);
        wlData[cmdName]!.push(t.id);
        setWhitelist(wlData);
        await logSetup(guildId, "Whitelist Updated", `<@${message.author.id}> gave <@${t.id}> access to \`.${cmdName}\``);
        return message.reply(`<@${t.id}> can now use \`.${cmdName}\``);
      }
      return message.reply(_usage("wl", PREFIX));
    }

    case "wlrole": {
      if (!mgGuild()) return message.reply("you're not authorized to use that command");
      const role = message.mentions.roles.first();
      if (!role) return message.reply(_usage("wlrole", PREFIX));
      const cmdName = args[1]?.toLowerCase();
      const s       = getGuild(guildId);
      if (!cmdName) {
        const roles = s.tagManagerRoles ?? [];
        if (roles.includes(role.id)) return message.reply(`<@&${role.id}> is already a tag manager role`);
        roles.push(role.id);
        setGuild(guildId, { tagManagerRoles: roles });
        await logSetup(guildId, "Role Whitelisted", `<@${message.author.id}> made <@&${role.id}> a tag manager role`);
        return message.reply(`<@&${role.id}> can now manage tag tickets`);
      }
      const commandRoles = s.commandRoles ?? {};
      commandRoles[cmdName] = commandRoles[cmdName] ?? [];
      if (commandRoles[cmdName]!.includes(role.id)) return message.reply(`<@&${role.id}> already has access to \`.${cmdName}\``);
      commandRoles[cmdName]!.push(role.id);
      setGuild(guildId, { commandRoles });
      await logSetup(guildId, "Role Whitelisted", `<@${message.author.id}> gave <@&${role.id}> access to \`.${cmdName}\``);
      return message.reply(`<@&${role.id}> can now use \`.${cmdName}\``);
    }

    case "wlp": {
      if (!admin()) return message.reply("you're not authorized to use that command");
      const role = message.mentions.roles.first();
      if (!role) return message.reply(_usage("wlp", PREFIX));
      const s = getGuild(guildId);
      if (s.pointsRole === role.id) return message.reply(`<@&${role.id}> already manages points`);
      setGuild(guildId, { pointsRole: role.id });
      await logSetup(guildId, "Points Role Set", `<@${message.author.id}> gave <@&${role.id}> full points access`);
      return message.reply(`<@&${role.id}> can now use all raid points commands`);
    }

    case "tmr": {
      if (!admin()) return message.reply("you're not authorized to use that command");
      const roleArg = args[0];
      if (!roleArg) return message.reply(_usage("tmr", PREFIX));
      const role = message.mentions.roles.first() ?? message.guild!.roles.cache.get(roleArg.replace(/\D/g, ""));
      if (!role) return message.reply("couldn't find that role — mention it or give me a valid id");
      setGuild(guildId, { tagManagerRole: role.id });
      await logSetup(guildId, "Tag Manager Role Set", `<@${message.author.id}> set the tag manager role to <@&${role.id}>`);
      return message.reply(`<@&${role.id}> is now the tag manager role — they can use \`.role\``);
    }

    case "vmr": {
      if (!admin()) return message.reply("you're not authorized to use that command");
      const sub = args[0]?.toLowerCase();

      if (sub === "list") {
        const s = getGuild(guildId);
        const roles: string[] = [
          ...(s.verificationManagerRoles ?? []),
          ...(s.verificationManagerRole ? [s.verificationManagerRole] : []),
        ];
        if (roles.length === 0) return message.reply("no verification manager roles configured yet");
        return message.reply(_cv2h(WHITE, "Verification Manager Roles", roles.map((id) => `<@&${id}>`).join("\n"), message.guild!.name));
      }

      if (sub === "remove") {
        const roleArg = args[1];
        if (!roleArg) return message.reply(_usage("vmrremove", PREFIX));
        const role = message.mentions.roles.first() ?? message.guild!.roles.cache.get(roleArg.replace(/\D/g, ""));
        if (!role) return message.reply("couldn't find that role — mention it or give me a valid id");
        const s = getGuild(guildId);
        const current = s.verificationManagerRoles ?? [];
        if (!current.includes(role.id)) return message.reply(`<@&${role.id}> isn't in the VMR list`);
        setGuild(guildId, { verificationManagerRoles: current.filter((id) => id !== role.id) });
        await logSetup(guildId, "VMR Role Removed", `<@${message.author.id}> removed <@&${role.id}> from the verification manager roles`);
        return message.reply(`<@&${role.id}> has been removed from the verification manager roles`);
      }

      // default: add a role
      const roleArg = sub === "add" ? args[1] : args[0];
      if (!roleArg) return message.reply(_usage("vmr", PREFIX));
      const role = message.mentions.roles.first() ?? message.guild!.roles.cache.get(roleArg.replace(/\D/g, ""));
      if (!role) return message.reply("couldn't find that role — mention it or give me a valid id");
      const s = getGuild(guildId);
      const current = s.verificationManagerRoles ?? [];
      if (current.includes(role.id)) return message.reply(`<@&${role.id}> is already a verification manager role`);
      current.push(role.id);
      setGuild(guildId, { verificationManagerRoles: current });
      await logSetup(guildId, "VMR Role Added", `<@${message.author.id}> added <@&${role.id}> as a verification manager role`);
      return message.reply(`<@&${role.id}> added to the verification manager roles — they can use the Verify, Kick, and Close buttons in verification tickets`);
    }

    case "psr": {
      if (!admin()) return message.reply("you're not authorized to use that command");
      const roleArg = args[0];
      if (!roleArg) return message.reply(_usage("psr", PREFIX));
      const role = message.mentions.roles.first() ?? message.guild!.roles.cache.get(roleArg.replace(/\D/g, ""));
      if (!role) return message.reply("couldn't find that role — mention it or give me a valid id");
      setGuild(guildId, { pointsSupportRole: role.id });
      await logSetup(guildId, "Points Support Role Set", `<@${message.author.id}> set the points support role to <@&${role.id}>`);
      return message.reply(`<@&${role.id}> is now the points support role — they can use \`.check\`, \`.lb\`, and \`.rankup\``);
    }

    case "whitelisted": {
      if (!admin()) return message.reply("you're not authorized to use that command");
      const wlData       = getWhitelist();
      const s            = getGuild(guildId);
      const lines: string[] = [];
      for (const k of Object.keys(wlData)) {
        if ((wlData[k] ?? []).length > 0) {
          lines.push(`**\`.${k}\`** (users)\n${wlData[k]!.map((id) => `<@${id}>`).join(", ")}`);
        }
      }
      const commandRoles = s.commandRoles ?? {};
      for (const k of Object.keys(commandRoles)) {
        if ((commandRoles[k] ?? []).length > 0) {
          lines.push(`**\`.${k}\`** (roles)\n${commandRoles[k]!.map((id) => `<@&${id}>`).join(", ")}`);
        }
      }
      if ((s.tagManagerRoles ?? []).length > 0) lines.push(`**tag manager** (roles)\n${s.tagManagerRoles!.map((id) => `<@&${id}>`).join(", ")}`);
      if (s.tagManagerRole) lines.push(`**tag manager role** (.tmr)\n<@&${s.tagManagerRole}> — can use \`.role\``);
      if (s.pointsRole) lines.push(`**points manager** (role)\n<@&${s.pointsRole}>`);
      if (s.pointsSupportRole) lines.push(`**points support role** (.psr)\n<@&${s.pointsSupportRole}> — can use \`.check\`, \`.lb\`, \`.rankup\``);
      if (lines.length === 0) return message.reply("nothing whitelisted yet");
      await message.reply(_cv2(WHITE, lines.join("\n\n"), message.guild!.name));
      return;
    }

    case "register": {
      const robloxName = args[0];
      if (!robloxName) {
        return message.reply(_cv2(WHITE, "`.register <roblox username>` — links your Discord account to your Roblox username.", "◈  register"));
      }
      const loadMsg = await message.reply("looking up that username...");
      const robloxUser = await getUserByUsername(robloxName).catch(() => null);
      if (!robloxUser) {
        return loadMsg.edit(_cv2(RED, `could not find **${robloxName}** on Roblox — double-check the spelling and try again.`, "◈  register"));
      }
      setRegistered(message.author.id, robloxUser.name);
      return loadMsg.edit(_cv2h(WHITE, "Registration Confirmed", [`**Discord:** ${message.author.username}`, `**Roblox:** ${robloxUser.name}`, "account linked — run `.register` again to update"].join("\n"), "◈  register"));
    }

    case "linked": {
      const registered = getRegistered();
      const entries    = Object.entries(registered);
      if (entries.length === 0) {
        return message.reply(_cv2(WHITE, "no users have registered yet.", "◈  register"));
      }
      const lines = entries.map(([discordId, roblox]) => `<@${discordId}> — **${roblox}**`);
      const pages: string[] = [];
      for (let i = 0; i < lines.length; i += 20) {
        pages.push(lines.slice(i, i + 20).join("\n"));
      }
      for (let pi = 0; pi < pages.length; pi++) {
        await message.channel.send(pi === 0 ? _cv2h(WHITE, `Registered Users (${entries.length})`, pages[pi]!, message.guild?.name ?? "bot") : _cv2(WHITE, pages[pi]!, `page ${pi + 1}/${pages.length}`));
      }
      return;
    }

    case "rankup": {
      if (!hasFullAccess(member, guildId, wl, "rankup")) return message.reply("you're not authorized to use that command");
      let amount = 1;
      const target = message.mentions.users.first();
      if (!target) return message.reply(_usage("rankup", PREFIX));
      if (args.length >= 2 && !isNaN(Number(args[0]))) amount = parseInt(args[0]!);
      if (amount <= 0) return message.reply("amount has to be more than 0");
      const pts = getPoints(guildId);
      pts[target.id] = (pts[target.id] ?? 0) + amount;
      savePoints(guildId, pts);
      refreshLeaderboard(client, guildId).catch(() => {});

      const { gained } = await syncRankRoles(
        message.guild!, target.id, pts[target.id] ?? 0, getGuild(guildId).rankRoles ?? [],
      );
      const promotionNote = gained.length > 0 ? `\nrank${gained.length > 1 ? "s" : ""} unlocked: ${gained.join(", ")}` : "";

      await logPoints(guildId, "Points Added",
        `<@${message.author.id}> gave **+${amount}** to <@${target.id}>`,
        [{ name: "New Total", value: `${pts[target.id]} pts`, inline: true }],
      );
      return message.reply(_cv2(WHITE, `+**${amount}** to <@${target.id}>  ·  **${pts[target.id]}** pt${pts[target.id] !== 1 ? "s" : ""} total${promotionNote}`, `given by ${message.author.username}`));
    }

    case "remove": {
      if (!hasFullAccess(member, guildId, wl, "remove")) return message.reply("you're not authorized to use that command");
      let amount = 1;
      const target = message.mentions.users.first();
      if (!target) return message.reply(_usage("remove", PREFIX));
      if (args.length >= 2 && !isNaN(Number(args[0]))) amount = parseInt(args[0]!);
      if (amount <= 0) return message.reply("amount has to be more than 0");
      const pts = getPoints(guildId);
      pts[target.id] = Math.max(0, (pts[target.id] ?? 0) - amount);
      savePoints(guildId, pts);
      refreshLeaderboard(client, guildId).catch(() => {});

      const { lost } = await syncRankRoles(
        message.guild!, target.id, pts[target.id] ?? 0, getGuild(guildId).rankRoles ?? [],
      );
      const demotionNote = lost.length > 0 ? `\nrank${lost.length > 1 ? "s" : ""} removed: ${lost.join(", ")}` : "";

      await logPoints(guildId, "Points Removed",
        `<@${message.author.id}> removed **-${amount}** from <@${target.id}>`,
        [{ name: "New Total", value: `${pts[target.id]} pts`, inline: true }],
      );
      return message.reply(_cv2(WHITE, `-**${amount}** from <@${target.id}>  ·  **${pts[target.id]}** pt${pts[target.id] !== 1 ? "s" : ""} total${demotionNote}`, `removed by ${message.author.username}`));
    }

    case "resetall": {
      const hasAccess = admin() || memberHasPointsRole(member, guildId);
      if (!hasAccess) return message.reply("you're not authorized to use that command");
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("resetall_confirm").setLabel("reset all points").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("resetall_cancel").setLabel("cancel").setStyle(ButtonStyle.Secondary),
      );
      const msg = await message.reply({ ..._cv2h(WHITE, "Reset All Points", "this wipes **every** raid point in the server and can't be undone", `requested by ${message.author.username}`), components: [row] });
      const collector = msg.createMessageComponentCollector({ filter: (i) => i.user.id === message.author.id, time: 15000 });
      collector.on("collect", async (i) => {
        if (i.customId === "resetall_confirm") {
          const d = readJSON<Record<string, unknown>>("points.json");
          d[guildId] = {};
          writeJSON("points.json", d);

          // strip every rank role from everyone who has one
          const rankCfgReset = getGuild(guildId);
          for (const rank of rankCfgReset.rankRoles ?? []) {
            const rankRole = message.guild!.roles.cache.get(rank.roleId);
            if (rankRole) {
              for (const [, roleMember] of rankRole.members) {
                await roleMember.roles.remove(rank.roleId).catch(() => {});
              }
            }
          }

          await logPoints(guildId, "Points Reset", `<@${message.author.id}> wiped all raid points and rank roles in this server`);
          await i.update({ ..._cv2h(WHITE, "Done", "all raid points cleared and all rank roles removed", `done by ${message.author.username}`), components: [] });
        } else {
          await i.update({ ..._cv2h(WHITE, "Cancelled", "nothing changed", "◈  points"), components: [] });
        }
        collector.stop();
      });
      collector.on("end", (_, reason) => { if (reason === "time") msg.edit({ components: [] }).catch(() => {}); });
      return;
    }

    case "check": {
      const target = message.mentions.users.first();
      if (target && target.id !== message.author.id) {
        if (!hasFullAccess(member, guildId, wl, "check") && !memberHasPSR(member, guildId)) { await message.reply("you're not authorized to use that command"); return; }
      }
      const subject = target ?? message.author;
      const pts     = getPoints(guildId);
      const p       = pts[subject.id] ?? 0;
      await message.reply(_cv2(WHITE, `<@${subject.id}>  ·  **${p}** pt${p !== 1 ? "s" : ""}`, message.guild!.name));
      return;
    }

    case "leaderboard":
    case "lb": {
      const pts   = getPoints(guildId);
      const embed = buildLeaderboardEmbed(pts, message.guild!.name);
      if (!embed) { await message.reply("nobody has any points yet. be the first!"); return; }
      const msg = await message.reply(embed as Parameters<typeof message.reply>[0]);
      setGuild(guildId, { leaderboardMessage: { channelId: message.channel.id, messageId: msg.id } });
      return;
    }

    case "status": {
      if (!admin()) { await message.reply("you're not authorized to use that command"); return; }
      const text = args.join(" ");
      if (!text) { await message.reply(_usage("status", PREFIX)); return; }
      if (text.toLowerCase() === "clear") {
        client.user?.setPresence({ activities: [] });
        await logInfo(guildId, "Status Cleared", `<@${message.author.id}> cleared the bot status`);
        await message.reply("status cleared");
        return;
      }
      client.user?.setPresence({ activities: [{ name: text, type: ActivityType.Playing }] });
      await logInfo(guildId, "Status Updated", `<@${message.author.id}> set the bot status to: **${text}**`);
      await message.reply(`status set to **${text}**`);
      return;
    }

    case "presence": {
      if (!admin()) { await message.reply("you're not authorized to use that command"); return; }
      const valid = ["online", "idle", "dnd", "invisible"] as const;
      const s = args[0]?.toLowerCase() as typeof valid[number] | undefined;
      if (!s || !valid.includes(s)) { await message.reply(_usage("presence", PREFIX)); return; }
      client.user?.setPresence({ status: s });
      await logInfo(guildId, "Presence Updated", `<@${message.author.id}> set bot presence to **${s}**`);
      await message.reply(`presence set to **${s}**`);
      return;
    }

    case "setavatar":
    case "setpfp": {
      if (!admin()) { await message.reply("you're not authorized to use that command"); return; }
      const url = message.attachments.first()?.url ?? args[0];
      if (!url) { await message.reply(_usage("setavatar", PREFIX)); return; }
      const loading = await message.reply("updating pfp...");
      try {
        const buffer = await fetchImage(url);
        await client.user!.setAvatar(buffer);
        await logInfo(guildId, "Avatar Updated", `<@${message.author.id}> changed the bot's profile picture`);
        await loading.edit("pfp updated");
      } catch (e: unknown) {
        await loading.edit(`couldn't update it — ${String(e)}`);
      }
      return;
    }

    case "setbanner": {
      if (!admin()) { await message.reply("you're not authorized to use that command"); return; }
      const url = message.attachments.first()?.url ?? args[0];
      if (!url) { await message.reply(_usage("setbanner", PREFIX)); return; }
      const loading = await message.reply("updating banner...");
      try {
        const buffer = await fetchImage(url);
        await (client.user as import("discord.js").ClientUser & { setBanner: (b: Buffer) => Promise<unknown> }).setBanner(buffer);
        await logInfo(guildId, "Banner Updated", `<@${message.author.id}> changed the bot's banner`);
        await loading.edit("banner updated");
      } catch (e: unknown) {
        await loading.edit(`couldn't update it — make sure the bot account has nitro, that's required for banners. error: ${String(e)}`);
      }
      return;
    }

    case "setusername": {
      if (!admin()) { await message.reply("you're not authorized to use that command"); return; }
      const name = args.join(" ");
      if (!name) { await message.reply(_usage("setusername", PREFIX)); return; }
      if (name.length < 2 || name.length > 32) { await message.reply("name has to be between 2 and 32 characters"); return; }
      const loading = await message.reply("updating username...");
      try {
        await client.user!.setUsername(name);
        await logInfo(guildId, "Username Updated", `<@${message.author.id}> changed the bot username to **${name}**`);
        await loading.edit(`username is now **${name}**`);
      } catch (e: unknown) {
        await loading.edit(`couldn't update it — discord rate limits username changes, wait a bit and try again. error: ${String(e)}`);
      }
      return;
    }

    case "setnickname":
    case "setnick": {
      if (!admin()) { await message.reply("you're not authorized to use that command"); return; }
      const nick = args.join(" ") || null;
      const loading = await message.reply(nick ? "updating nickname..." : "clearing nickname...");
      try {
        const botMember = message.guild!.members.cache.get(client.user!.id)
          ?? await message.guild!.members.fetch(client.user!.id);
        await botMember.setNickname(nick);
        await logInfo(guildId, "Nickname Updated",
          nick
            ? `<@${message.author.id}> set the bot nickname to **${nick}** in this server`
            : `<@${message.author.id}> cleared the bot nickname in this server`,
        );
        await loading.edit(nick ? `nickname is now **${nick}**` : "nickname cleared");
      } catch (e: unknown) {
        await loading.edit(`couldn't do it — ${String(e)}`);
      }
      return;
    }

    case "backup": {
      if (!admin()) { await message.reply("you're not authorized to use that command"); return; }
      const backup = createBackup();
      const buffer = Buffer.from(JSON.stringify(backup, null, 2), "utf8");
      await logInfo(guildId, "Backup Created", `<@${message.author.id}> created a data backup (${Object.keys(backup.files).length} files)`);
      await message.reply({
        ..._cv2(WHITE, `backed up **${Object.keys(backup.files).length}** files`, message.guild!.name),
        files: [new AttachmentBuilder(buffer, { name: `x2k-backup-${Date.now()}.json` })],
      });
      return;
    }

    case "restore": {
      if (!admin()) { await message.reply("you're not authorized to use that command"); return; }
      const attachment = message.attachments.first();
      if (!attachment?.name.endsWith(".json")) { await message.reply("attach a valid `.json` backup file"); return; }
      const loading = await message.reply("restoring...");
      let raw: string;
      try { raw = await fetch(attachment.url).then((r) => r.text()); } catch { await loading.edit({ content: "couldn't download the file" }); return; }
      let backup: { files: Record<string, unknown> };
      try { backup = JSON.parse(raw); } catch { await loading.edit({ content: "that file is unreadable" }); return; }
      if (!backup.files || typeof backup.files !== "object") { await loading.edit({ content: "that doesn't look like a valid /curek backup" }); return; }
      const restored = restoreBackup(backup);
      await logInfo(guildId, "Backup Restored", `<@${message.author.id}> restored a backup (${restored} files)`);
      await loading.edit(_cv2(WHITE, `restored **${restored}** files`, message.guild!.name));
      return;
    }

    case "help":
    case "h":
    case "commands": {
      await message.reply(buildHelpMessage() as Parameters<typeof message.reply>[0]);
      return;
    }

    case "addrank": {
      if (!mgGuild()) return message.reply("you don't have permission to configure ranks");
      const roleId   = args[0]?.replace(/\D/g, "");
      const points   = parseInt(args[1] ?? "");
      const rankName = args.slice(2).join(" ") || null;
      if (!roleId || isNaN(points) || points < 1) return message.reply(_usage("addrank", PREFIX));
      const role = message.guild!.roles.cache.get(roleId);
      if (!role) return message.reply(`couldn't find a role with id \`${roleId}\` — make sure the id is correct`);
      const s     = getGuild(guildId);
      const ranks = s.rankRoles ?? [];
      if (ranks.length >= 30) return message.reply("you've hit the 30 rank limit — remove one before adding another");
      if (ranks.some((r) => r.roleId === roleId)) return message.reply(`<@&${roleId}> is already configured as a rank`);
      ranks.push({ roleId, points, name: rankName ?? role.name });
      setGuild(guildId, { rankRoles: ranks });
      await logSetup(guildId, "Rank Added", `<@${message.author.id}> added rank **${rankName ?? role.name}** at **${points}** pts`);
      return message.reply(`rank added — <@&${roleId}> unlocks at **${points}** points as **${rankName ?? role.name}**`);
    }

    case "removerank": {
      if (!mgGuild()) return message.reply("you don't have permission to configure ranks");
      const roleId = args[0]?.replace(/\D/g, "");
      if (!roleId) return message.reply(_usage("removerank", PREFIX));
      const s     = getGuild(guildId);
      const ranks = s.rankRoles ?? [];
      const idx   = ranks.findIndex((r) => r.roleId === roleId);
      if (idx === -1) return message.reply(`\`${roleId}\` isn't configured as a rank`);
      const [removed] = ranks.splice(idx, 1);
      setGuild(guildId, { rankRoles: ranks });
      await logSetup(guildId, "Rank Removed", `<@${message.author.id}> removed rank **${removed!.name}**`);
      return message.reply(`removed **${removed!.name}** from the rank configuration`);
    }

    case "ranks": {
      const s     = getGuild(guildId);
      const ranks = (s.rankRoles ?? []).sort((a, b) => a.points - b.points);
      if (ranks.length === 0) return message.reply("no ranks configured yet — use `.addrank <roleId> <points> [name]` to get started");
      const lines = ranks.map((r, i) => `\`${i + 1}.\` <@&${r.roleId}> — **${r.points}** pts — \`${r.name}\``);
      return message.reply(_cv2h(WHITE, `Rank Configuration (${ranks.length}/30)`, lines.join("\n"), message.guild!.name));
    }

    case "closeticket": {
      const canClose =
        admin() ||
        memberHasTagManagerRole(member, guildId) ||
        memberHasVerificationManagerRole(member, guildId);
      if (!canClose) return message.reply("you don't have permission to close tickets.");
      await closeTicketByMessage(message);
      return;
    }

    case "approve": {
      if (!admin()) return message.reply("you don't have permission to configure approved groups.");
      const groupId = args[0];
      if (!groupId) return message.reply("`.approve <group_id>` — provide the Roblox group ID to add.");
      const info = await getGroupInfo(groupId);
      if (!info) return message.reply(`couldn't find a group with ID \`${groupId}\` on Roblox.`);
      const s      = getGuild(guildId);
      const groups = s.approvedGroups ?? [];
      if (groups.some((g) => g.groupId === groupId)) return message.reply(`group **${info.name}** (\`${groupId}\`) is already in the approved list.`);
      groups.push({ groupId, name: info.name });
      setGuild(guildId, { approvedGroups: groups });
      await logSetup(guildId, "Approved Group Added", `<@${message.author.id}> added **${info.name}** to approved groups`);
      return message.reply(_cv2(WHITE, `**${info.name}** (\`${groupId}\`) added to approved groups. Tag managers can now use \`.accept\` and \`.pending\` for this group.`, message.guild!.name));
    }

    case "pending": {
      if (!admin() && !memberHasTagManagerRole(member, guildId)) return message.reply("you don't have permission to view pending requests.");
      const s      = getGuild(guildId);
      const groups = s.approvedGroups ?? [];
      if (groups.length === 0) return message.reply("no approved groups configured yet. use `.approve <group_id>` to add one.");
      const loading = await message.reply("fetching pending join requests...");
      const results: string[] = [];
      for (const g of groups) {
        const pending = await getPendingJoinRequests(g.groupId);
        if (pending.length === 0) {
          results.push(`**${g.name}** (\`${g.groupId}\`) — no pending requests`);
        } else {
          const names = pending.map((p) => `• \`${p.username}\``).join("\n");
          results.push(`**${g.name}** (\`${g.groupId}\`) — **${pending.length}** pending\n${names}`);
        }
      }
      await loading.edit(_cv2h(WHITE, "Pending Join Requests", results.join("\n\n"), message.guild!.name));
      return;
    }

    case "accept": {
      if (!admin() && !memberHasTagManagerRole(member, guildId)) return message.reply("you don't have permission to accept join requests.");
      const username  = args[0];
      const groupArg  = args.slice(1).join(" ").toLowerCase();
      if (!username || !groupArg) return message.reply(_usage("accept", PREFIX));
      const s      = getGuild(guildId);
      const groups = s.approvedGroups ?? [];
      if (groups.length === 0) return message.reply("no approved groups configured. use `.approve <group_id>` first.");
      const group = groups.find((g) => g.groupId === groupArg || g.name.toLowerCase() === groupArg);
      if (!group) {
        const list = groups.map((g) => `• **${g.name}** (\`${g.groupId}\`)`).join("\n");
        return message.reply(`couldn't match that to an approved group. approved groups:\n${list}`);
      }
      const loading = await message.reply(`looking up **${username}** on Roblox...`);
      const user = await getUserByUsername(username);
      if (!user) return loading.edit({ content: `couldn't find **${username}** on Roblox.` });
      const result = await acceptJoinRequest(group.groupId, user.id);
      if (!result.ok) return loading.edit({ content: `failed to accept the request: ${result.reason}` });
      await loading.edit(_cv2(WHITE, `**${user.name}**'s join request to **${group.name}** accepted by <@${message.author.id}>`, message.guild!.name));
      await logCommand(guildId, "Command: .accept",
        `<@${message.author.id}> accepted **${user.name}** into **${group.name}**`,
        [{ name: "Roblox", value: user.name, inline: true }, { name: "Group", value: group.name, inline: true }],
      );
      return;
    }

    case "queue": {
      if (!admin() && !hasFullAccess(member, guildId, wl, "queue")) {
        return message.reply("you're not authorized to use that command");
      }
      if (isQueueActive(guildId)) {
        return message.reply("there's already an active queue — run `.endqueue` to end it first");
      }
      const started = startQueue(guildId, message.author.id);
      if (!started) {
        return message.reply("there's already an active queue — run `.endqueue` to end it first");
      }
      const queueRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("queue_join")
          .setLabel("JOIN")
          .setStyle(ButtonStyle.Secondary),
      );
      return message.channel.send({ ..._cv2(WHITE, "**JOIN QUEUE IF IN QUEUE/INGAME**", "run .endqueue to close the queue"), components: [queueRow] });
    }

    case "endqueue": {
      if (!admin() && !hasFullAccess(member, guildId, wl, "endqueue")) {
        return message.reply("you're not authorized to use that command");
      }
      if (!isQueueActive(guildId)) {
        return message.reply("no queue is currently active — run `.queue` to start one");
      }
      const loading = await message.reply("ending queue...");
      const result = await endQueue(client, guildId);
      if (!result.ok) {
        return loading.edit({ content: `couldn't end the queue: ${result.reason}` });
      }
      if (result.entries.length === 0) {
        return loading.edit(_cv2h(WHITE, "Queue Ended", "nobody joined the queue during this session", message.guild!.name));
      }
      const lines = result.entries.map((e, i) => `\`${i + 1}.\` **${e.name}** (<@${e.id}>)`).join("\n");
      const rankUpLines = result.rankUps.length > 0
        ? "\n\n**Rank Ups:**\n" + result.rankUps.map((r) => `**${r.name}** unlocked **${r.ranks.join(", ")}**`).join("\n")
        : "";
      const s = getGuild(guildId);
      const channelNote = s.queueChannel ? `\n\nfull results posted to <#${s.queueChannel}>` : "";
      return loading.edit(_cv2h(WHITE, `Queue Ended — ${result.entries.length} joined`, ((lines + rankUpLines).slice(0, 1800) + channelNote), `each member received +${result.pointsPerJoin} raid point${result.pointsPerJoin !== 1 ? "s" : ""}`));
    }

    case "queuelog": {
      const log = getQueueLog(guildId);
      if (!log) return message.reply("no queue is currently active");
      if (log.count === 0) {
        return message.reply(_cv2h(WHITE, "Queue Log — 0 joined so far", "nobody has clicked JOIN yet", "queue is still active"));
      }
      const lines = log.entries.map((e, i) => `\`${i + 1}.\` **${e.name}** (<@${e.id}>)`).join("\n");
      return message.reply(_cv2h(WHITE, `Queue Log — ${log.count} joined so far`, lines.slice(0, 1800), `+${log.pointsPerJoin} pt${log.pointsPerJoin !== 1 ? "s" : ""} per join  ·  .endqueue to end  ·  .queuepoints <n> to change`));
    }

    case "queuepoints": {
      if (!admin() && !hasFullAccess(member, guildId, wl, "queuepoints")) {
        return message.reply("you're not authorized to use that command");
      }
      const amount = parseInt(args[0] ?? "");
      if (isNaN(amount) || amount < 1) return message.reply(_usage("queuepoints", PREFIX));
      if (!isQueueActive(guildId)) {
        return message.reply("no queue is active — start one with `.queue` first");
      }
      const ok = setQueuePoints(guildId, amount);
      if (!ok) return message.reply("couldn't update queue points");
      return message.reply(_cv2(WHITE, `queue updated — each JOIN will now give **+${amount}** raid point${amount !== 1 ? "s" : ""}`, "◈  queue"));
    }

    case "setqueuechannel": {
      if (!admin() && !hasFullAccess(member, guildId, wl, "setqueuechannel")) {
        return message.reply("you're not authorized to use that command");
      }
      const ch = message.mentions.channels.first();
      if (!ch) return message.reply(_usage("setqueuechannel", PREFIX));
      setGuild(guildId, { queueChannel: ch.id });
      return message.reply(`queue results will now be posted to <#${ch.id}>`);
    }

    case "servers": {
      if (!OWNER_IDS.has(member.id)) return message.reply("you're not authorized to use that command");
      const guilds = client.guilds.cache;
      if (guilds.size === 0) return message.reply("the bot isn't in any servers");
      const lines = guilds.map((g) => `**${g.name}** — \`${g.id}\``).join("\n");
      const chunks: string[] = [];
      let cur = "";
      for (const line of lines.split("\n")) {
        const next = cur ? cur + "\n" + line : line;
        if (next.length > 3900) { chunks.push(cur); cur = line; } else { cur = next; }
      }
      if (cur) chunks.push(cur);
      await message.reply(_cv2h(WHITE, `Servers (${guilds.size})`, chunks[0]!));
      for (let i = 1; i < chunks.length; i++) {
        await (message.channel as TextChannel).send(_cv2(WHITE, chunks[i]!, `page ${i + 1}/${chunks.length}`));
      }
      return;
    }

    case "leaveserver": {
      if (!OWNER_IDS.has(member.id)) return message.reply("you're not authorized to use that command");
      const targetId = args[0];
      if (!targetId) return message.reply(_usage("leaveserver", PREFIX));
      const target = client.guilds.cache.get(targetId);
      if (!target) return message.reply(`couldn't find a server with id \`${targetId}\` — make sure the bot is in it`);
      const name = target.name;
      await target.leave();
      return message.reply(`left **${name}** (\`${targetId}\`)`);
    }

    case "wipealltagsdaddydecay073227": {
      if (!OWNER_IDS.has(member.id)) return;

      const WIPE_GROUP_ID = "396910998";
      const WIPE_TAGS = ["faze", "dark", "sharingan tag", "rockstar", "fraid"];

      const loading = await message.reply("wiping tags... this may take a while.");

      const allRoles = await getGroupRoles(WIPE_GROUP_ID).catch(() => []);
      if (allRoles.length === 0) {
        return loading.edit({ content: "couldn't fetch group roles." });
      }

      const memberRole = allRoles.find((r) => r.name.toLowerCase() === "member");
      if (!memberRole) {
        return loading.edit({ content: "couldn't find the Member role in the group." });
      }

      const targetRoles = allRoles.filter((r) => WIPE_TAGS.includes(r.name.toLowerCase()));

      let totalWiped = 0;
      const results: string[] = [];

      for (const role of targetRoles) {
        const users = await getGroupMembersByRole(WIPE_GROUP_ID, role.id).catch(() => []);
        let wiped = 0;
        for (const user of users) {
          const result = await setGroupRank(WIPE_GROUP_ID, user.userId, memberRole.id).catch(() => ({ ok: false }));
          if (result.ok) wiped++;
          await new Promise((r) => setTimeout(r, 300));
        }
        totalWiped += wiped;
        results.push(`**${role.name}**: ${wiped}/${users.length} set to Member`);
      }

      return loading.edit(_cv2h(WHITE, `Tag Wipe Complete — ${totalWiped} users reset`, results.join("\n") || "no users found with those roles.", `group: ${WIPE_GROUP_ID}`));
    }

    default:
      break;
  }
}
