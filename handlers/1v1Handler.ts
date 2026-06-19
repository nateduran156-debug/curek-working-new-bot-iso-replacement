import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildMember,
  type TextChannel,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  getLeaderboard,
  saveLeaderboard,
  getPlayerBySpot,
  getPlayerEntry,
  setPlayerAtSpot,
  removeFromSpot,
  swapSpots,
  applyCooldown,
  applyWinnerCooldown,
  clearCooldown,
  isOnCooldown,
  createChallenge,
  getChallenge,
  updateChallenge,
  deleteChallenge,
  getExpiredPendingChallenges,
  getActiveChallengeBetween,
  getActiveChallengeForUser,
  getAttendanceInLastN,
  logRaid,
  getRecentRaids,
  logMatch,
  getMatchHistory,
  getPlayerStats,
  getMatchLogChannel,
  setMatchLogChannel,
  getLiveLeaderboard,
  setLiveLeaderboard,
  getIsFrozen,
  getPendingChallengesWarningSoon,
  markWarningSent,
  getLastMatchBetween,
  TWO_DAYS_MS,
  ONE_DAY_MS,
  REMATCH_COOLDOWN_MS,
  type RankedPlayer,
  type MatchRecord,
  type PendingChallenge,
} from "../utils/1v1Storage.js";
import { getGuild, getWhitelist } from "../utils/storage.js";
import { logInfo } from "../utils/botLogger.js";

const DARK  = 0x1a1a2e;
const GREEN = 0x2ecc71;
const RED   = 0xe74c3c;
const GOLD  = 0xf1c40f;
const BLUE  = 0x3498db;

const FALLBACK_LOG_CATEGORY_ID  = "1514692597308981289";
export const TAG_CATEGORY_ID    = "1474702146309062770";
export const VERIFY_CATEGORY_ID = "1474701312762446057";

const LOG_CLICK_TTL = 30 * 60 * 1000;
const pendingLogClicks = new Map<string, { userId: string; at: number }>();

const OWNER_IDS = new Set(["1456824205545967713", "1490246846583537787"]);

function ts() { return new Date().toISOString(); }

function fmtDate(ms: number) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function canManage1v1(member: GuildMember | null, guildId: string): boolean {
  if (!member) return false;
  if (OWNER_IDS.has(member.id)) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const wl = getWhitelist();
  return (wl["bot"] ?? []).includes(member.id);
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

function cv2WithHeader(color: number, header: string, body: string, footer?: string) {
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


async function refreshLiveLeaderboard(client: Client, guildId: string): Promise<void> {
  try {
    const live = getLiveLeaderboard(guildId);
    if (!live) return;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const ch = guild.channels.cache.get(live.channelId) as TextChannel | undefined;
    if (!ch) return;
    const msg = await ch.messages.fetch(live.messageId).catch(() => null);
    if (!msg) return;
    const payload = build1v1Embed(guildId);
    await msg.edit(payload as Parameters<typeof msg.edit>[0]);
  } catch { /* ignore */ }
}


async function postMatchResult(
  client: Client,
  guildId: string,
  payload: { components: object[]; flags: number },
): Promise<void> {
  try {
    const channelId = getMatchLogChannel(guildId);
    if (!channelId) return;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const ch = guild.channels.cache.get(channelId) as TextChannel | undefined;
    if (!ch) return;
    await ch.send(payload as never);
  } catch { /* ignore */ }
}

async function postTicketMessages(
  client: Client,
  guildId: string,
  ticketChannel: TextChannel,
): Promise<void> {
  try {
    const channelId = getMatchLogChannel(guildId);
    if (!channelId) return;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const logCh = guild.channels.cache.get(channelId) as TextChannel | undefined;
    if (!logCh) return;

    const fetched = await ticketChannel.messages.fetch({ limit: 100 });
    const msgs = [...fetched.values()].reverse();
    if (msgs.length === 0) return;

    const lines = msgs
      .filter((m) => !m.author.bot)
      .map((m) => {
        const time = `<t:${Math.floor(m.createdTimestamp / 1000)}:t>`;
        const attachmentUrls = [...m.attachments.values()].map((a) => a.url).join("\n");
        const content = [m.content, attachmentUrls].filter(Boolean).join("\n") || "[embed]";
        return `**${m.author.username}** ${time}\n${content}`;
      });

    if (lines.length === 0) return;

    const chunks: string[] = [];
    let current = `**#${ticketChannel.name} — messages**\n`;
    for (const line of lines) {
      if (current.length + line.length + 2 > 1900) {
        chunks.push(current);
        current = "";
      }
      current += line + "\n\n";
    }
    if (current.trim()) chunks.push(current);

    for (const chunk of chunks) {
      await logCh.send({ content: chunk }).catch(() => {});
    }
  } catch { /* ignore */ }
}


export function build1v1Embed(guildId: string): { components: object[]; flags: number } {
  const lb = getLeaderboard(guildId);
  const lines: string[] = [];

  for (let spot = 1; spot <= 5; spot++) {
    const player = lb[String(spot)];
    if (!player) {
      lines.push(`\`#${spot}\`  ✅  **Open**`);
    } else {
      const onCD = isOnCooldown(player);
      let icon = "✅";
      let statusTag = "";

      if (onCD) {
        icon = "🛡️";
      } else if (player.pendingChallengeId) {
        const ch = getChallenge(player.pendingChallengeId);
        if (ch?.status === "accepted") {
          icon = "⚔️";
          statusTag = "  *(in progress)*";
        } else {
          icon = "🕐";
          statusTag = "  *(pending)*";
        }
      }

      let line = `\`#${spot}\`  ${icon}  <@${player.userId}>${statusTag}`;
      if (onCD && player.cooldownUntil) {
        line += `  ·  📆 ${fmtDate(player.cooldownUntil)}`;
      }
      lines.push(line);
    }
  }

  const c = new ContainerBuilder().setAccentColor(DARK);
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**◈  TOP 5 LEADERBOARD**`));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join("\n")));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `🛡️ cooldown  ·  ✅ open  ·  🕐 pending  ·  ⚔️ in progress\n-# loser: 2d cooldown  ·  winner: 1d cooldown  ·  48h no-result = auto forfeit`,
  ));

  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}


export async function handleChallengeCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "this only works in a server.", ephemeral: true });
    return;
  }

  const guildId = interaction.guild.id;

  if (getIsFrozen(guildId)) {
    await interaction.reply({ content: "the 1v1 leaderboard is currently frozen — no new challenges can be made.", ephemeral: true });
    return;
  }

  const opponent = interaction.options.getUser("opponent", true);

  if (opponent.id === interaction.user.id) {
    await interaction.reply({ content: "you can't challenge yourself.", ephemeral: true });
    return;
  }
  if (opponent.bot) {
    await interaction.reply({ content: "bots can't compete.", ephemeral: true });
    return;
  }

  const opponentEntry = getPlayerEntry(guildId, opponent.id);
  if (!opponentEntry) {
    await interaction.reply({
      content: `<@${opponent.id}> isn't on the leaderboard — they need to hold a spot before they can be challenged.`,
      ephemeral: true,
    });
    return;
  }

  const opponentSpot   = opponentEntry.spot;
  const opponentPlayer = opponentEntry.player;

  if (isOnCooldown(opponentPlayer)) {
    await interaction.reply({
      content: `<@${opponent.id}> is on cooldown until **${fmtDate(opponentPlayer.cooldownUntil!)}** — they can't be challenged right now.`,
      ephemeral: true,
    });
    return;
  }

  if (opponentPlayer.pendingChallengeId) {
    await interaction.reply({
      content: `<@${opponent.id}> already has a pending challenge.`,
      ephemeral: true,
    });
    return;
  }

  const challengerEntry = getPlayerEntry(guildId, interaction.user.id);

  if (challengerEntry && isOnCooldown(challengerEntry.player)) {
    await interaction.reply({
      content: `you're on cooldown until **${fmtDate(challengerEntry.player.cooldownUntil!)}**.`,
      ephemeral: true,
    });
    return;
  }

  if (challengerEntry?.player.pendingChallengeId) {
    await interaction.reply({ content: "you already have a pending challenge.", ephemeral: true });
    return;
  }

  const existing = getActiveChallengeBetween(guildId, interaction.user.id, opponent.id);
  if (existing) {
    await interaction.reply({ content: "there's already an active challenge between you two.", ephemeral: true });
    return;
  }

  const lastMatch = getLastMatchBetween(guildId, interaction.user.id, opponent.id);
  if (lastMatch && Date.now() - lastMatch.timestamp < REMATCH_COOLDOWN_MS) {
    const unlocksAt = lastMatch.timestamp + REMATCH_COOLDOWN_MS;
    await interaction.reply({
      content: `you already played <@${opponent.id}> recently — rematch unlocks **${fmtDate(unlocksAt)}**.`,
      ephemeral: true,
    });
    return;
  }

  const challengeId = `ch_${Date.now()}_${interaction.user.id}`;

  const acceptBtn = new ButtonBuilder()
    .setCustomId(`1v1_accept::${challengeId}`)
    .setLabel("Accept")
    .setStyle(ButtonStyle.Success);

  const declineBtn = new ButtonBuilder()
    .setCustomId(`1v1_decline::${challengeId}`)
    .setLabel("Decline")
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(acceptBtn, declineBtn);

  const spotLabel = challengerEntry ? `Spot #${challengerEntry.spot}` : "Unranked";

  const body = [
    `**challenger**  ·  <@${interaction.user.id}>  (${spotLabel})`,
    `**opponent**    ·  <@${opponent.id}>  (Spot #${opponentSpot})`,
    ``,
    `<@${opponent.id}> — accept or decline below`,
    `48h to respond or this gets auto-cancelled`,
  ].join("\n");

  const c = cv2WithHeader(GOLD, "1v1 Challenge", body, "◈  1v1");

  await interaction.reply({ components: [c, row], flags: MessageFlags.IsComponentsV2 });
  const msg = await interaction.fetchReply();

  createChallenge({
    id: challengeId,
    challengerId: interaction.user.id,
    opponentId: opponent.id,
    opponentSpot,
    challengerSpot: challengerEntry?.spot ?? null,
    guildId,
    channelId: interaction.channelId,
    messageId: msg.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + TWO_DAYS_MS,
    status: "pending",
  });

  const lb = getLeaderboard(guildId);
  if (lb[String(opponentSpot)]) {
    lb[String(opponentSpot)]!.pendingChallengeId = challengeId;
  }
  if (challengerEntry && lb[String(challengerEntry.spot)]) {
    lb[String(challengerEntry.spot)]!.pendingChallengeId = challengeId;
  }
  saveLeaderboard(guildId, lb);
}


export async function handleChallengeAccept(interaction: ButtonInteraction, challengeId: string): Promise<void> {
  const challenge = getChallenge(challengeId);
  if (!challenge || challenge.status !== "pending") {
    await interaction.reply({ content: "this challenge is no longer active.", ephemeral: true });
    return;
  }
  if (interaction.user.id !== challenge.opponentId) {
    await interaction.reply({ content: "only the opponent can accept this challenge.", ephemeral: true });
    return;
  }

  updateChallenge(challengeId, { status: "accepted" });

  const body = [
    `**challenger**  ·  <@${challenge.challengerId}>`,
    `**opponent**    ·  <@${challenge.opponentId}>  (Spot #${challenge.opponentSpot})`,
    ``,
    `go play your match then open a log ticket to submit proof`,
    `48h — if no result is logged the challenger takes the auto loss`,
  ].join("\n");

  const c = cv2WithHeader(GREEN, "Challenge Accepted", body, "◈  1v1");
  await interaction.update({ components: [c], flags: MessageFlags.IsComponentsV2 });
}


export async function handleChallengeDecline(interaction: ButtonInteraction, challengeId: string): Promise<void> {
  const challenge = getChallenge(challengeId);
  if (!challenge || challenge.status !== "pending") {
    await interaction.reply({ content: "this challenge is no longer active.", ephemeral: true });
    return;
  }
  if (interaction.user.id !== challenge.opponentId) {
    await interaction.reply({ content: "only the opponent can decline this challenge.", ephemeral: true });
    return;
  }

  clearChallengeFromPlayers(challenge.guildId, challenge);
  deleteChallenge(challengeId);

  const body = `<@${challenge.opponentId}> declined the challenge from <@${challenge.challengerId}>`;
  const c = cv2WithHeader(RED, "Challenge Declined", body, "◈  1v1 system");
  await interaction.update({ components: [c], flags: MessageFlags.IsComponentsV2 });
}


async function resolveLogCategory(guild: Guild, settings: ReturnType<typeof getGuild>) {
  const catId = settings.logTicketCategoryId ?? FALLBACK_LOG_CATEGORY_ID;
  return guild.channels.cache.get(catId) ?? await guild.channels.fetch(catId).catch(() => null);
}


function buildStaffPerms(guild: Guild, settings: ReturnType<typeof getGuild>): import("discord.js").OverwriteResolvable[] {
  const allow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory];
  const perms: import("discord.js").OverwriteResolvable[] = [];
  const vmrRoleIds: string[] = [
    ...(settings.verificationManagerRoles ?? []),
    ...(settings.verificationManagerRole ? [settings.verificationManagerRole] : []),
  ];
  for (const roleId of vmrRoleIds) {
    if (guild.roles.cache.has(roleId)) perms.push({ id: roleId, allow });
  }
  if (settings.pointsRole && guild.roles.cache.has(settings.pointsRole)) {
    perms.push({ id: settings.pointsRole, allow });
  }
  return perms;
}


async function openSharedLogTicket(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  guild: Guild,
  triggerUserId: string,
  firstClickUserId: string,
  challenge: PendingChallenge,
): Promise<void> {
  const settings = getGuild(guild.id);
  const allow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory];

  const channelPerms: import("discord.js").OverwriteResolvable[] = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: challenge.challengerId, allow },
    { id: challenge.opponentId,  allow },
    ...buildStaffPerms(guild, settings),
  ];

  const logCategory = await resolveLogCategory(guild, settings);

  const u1 = await interaction.client.users.fetch(challenge.challengerId).catch(() => null);
  const u2 = await interaction.client.users.fetch(challenge.opponentId).catch(() => null);
  const chanName = `log-${u1?.username ?? "p1"}-vs-${u2?.username ?? "p2"}`.slice(0, 100);

  const ch = await guild.channels.create({
    name: chanName,
    type: ChannelType.GuildText,
    parent: logCategory?.id,
    permissionOverwrites: channelPerms,
  }) as TextChannel;

  const winBtn = new ButtonBuilder()
    .setCustomId(`1v1_log_win::${challenge.challengerId}::${challenge.id}`)
    .setLabel("Challenger Won")
    .setStyle(ButtonStyle.Success);

  const lossBtn = new ButtonBuilder()
    .setCustomId(`1v1_log_loss::${challenge.challengerId}::${challenge.id}`)
    .setLabel("Opponent Won")
    .setStyle(ButtonStyle.Danger);

  const disputeBtn = new ButtonBuilder()
    .setCustomId(`1v1_log_dispute::${challenge.id}`)
    .setLabel("Dispute")
    .setStyle(ButtonStyle.Primary);

  const closeBtn = new ButtonBuilder()
    .setCustomId("1v1_log_close")
    .setLabel("Close Ticket")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(winBtn, lossBtn, disputeBtn, closeBtn);

  const pingSet = new Set([`<@${challenge.challengerId}>`, `<@${challenge.opponentId}>`]);
  if (settings.pointsSupportRole) pingSet.add(`<@&${settings.pointsSupportRole}>`);
  if (settings.pointsRole)        pingSet.add(`<@&${settings.pointsRole}>`);

  const body = [
    `**challenger**  ·  <@${challenge.challengerId}>`,
    `**opponent**    ·  <@${challenge.opponentId}>`,
    `**spot**        ·  \`#${challenge.opponentSpot}\``,
    ``,
    `drop your screenshot proof above — staff will log the result`,
  ].join("\n");

  const c = cv2WithHeader(DARK, "1v1 Log Ticket", body, "◈  1v1 log");

  await ch.send({
    content: [...pingSet].join(" "),
    components: [c, row],
    flags: MessageFlags.IsComponentsV2,
  });

  const replyFn = interaction.isButton()
    ? (interaction as ButtonInteraction).reply.bind(interaction)
    : (interaction as ChatInputCommandInteraction).reply.bind(interaction);

  await replyFn({ content: `log ticket opened: <#${ch.id}>`, ephemeral: true });

  const otherUserId = triggerUserId === challenge.challengerId ? challenge.opponentId : challenge.challengerId;
  const otherUser = await interaction.client.users.fetch(otherUserId).catch(() => null);
  if (otherUser) {
    await otherUser.send({ content: `your 1v1 log ticket is open: <#${ch.id}>` }).catch(() => {});
  }
}


export async function openLogTicket(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  guild: Guild,
): Promise<void> {
  const userId   = interaction.user.id;
  const settings = getGuild(guild.id);
  const allow    = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory];

  const replyFn = interaction.isButton()
    ? (interaction as ButtonInteraction).reply.bind(interaction)
    : (interaction as ChatInputCommandInteraction).reply.bind(interaction);

  const wl = getWhitelist();
  const whitelisted = (wl["bot"] ?? []).includes(userId);
  if (!OWNER_IDS.has(userId) && !whitelisted) {
    await replyFn({ content: "you're not whitelisted to open log tickets.", ephemeral: true });
    return;
  }

  const activeChallenge = getActiveChallengeForUser(guild.id, userId);

  if (activeChallenge) {
    const otherId  = activeChallenge.challengerId === userId ? activeChallenge.opponentId : activeChallenge.challengerId;
    const existing = pendingLogClicks.get(activeChallenge.id);

    if (existing) {
      if (existing.userId === otherId && Date.now() - existing.at < LOG_CLICK_TTL) {
        pendingLogClicks.delete(activeChallenge.id);
        await openSharedLogTicket(interaction, guild, userId, otherId, activeChallenge);
        return;
      }
      if (existing.userId === userId && Date.now() - existing.at < LOG_CLICK_TTL) {
        await replyFn({
          content: `still waiting for <@${otherId}> to click the button — the ticket will open automatically when they do\n\nif they don't click within 30 minutes, click again for a solo ticket`,
          ephemeral: true,
        });
        return;
      }
    }

    pendingLogClicks.set(activeChallenge.id, { userId, at: Date.now() });
    await replyFn({
      content: `waiting for <@${otherId}> to open a log ticket too — when they click the button a shared ticket will open for both of you automatically\n\nif they don't click within 30 minutes, click again to open a solo ticket`,
      ephemeral: true,
    });
    return;
  }

  const channelPerms: import("discord.js").OverwriteResolvable[] = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: userId, allow },
    ...buildStaffPerms(guild, settings),
  ];

  const logCategory = await resolveLogCategory(guild, settings);

  const ch = await guild.channels.create({
    name: `log-${interaction.user.username}`,
    type: ChannelType.GuildText,
    parent: logCategory?.id,
    permissionOverwrites: channelPerms,
  }) as TextChannel;

  const challengerEntry = getPlayerEntry(guild.id, userId);
  const challengeActive = challengerEntry?.player.pendingChallengeId
    ? getChallenge(challengerEntry.player.pendingChallengeId)
    : null;

  const winBtn = new ButtonBuilder()
    .setCustomId(`1v1_log_win::${userId}::${challengeActive?.id ?? "none"}`)
    .setLabel("Challenger Won")
    .setStyle(ButtonStyle.Success);

  const lossBtn = new ButtonBuilder()
    .setCustomId(`1v1_log_loss::${userId}::${challengeActive?.id ?? "none"}`)
    .setLabel("Opponent Won")
    .setStyle(ButtonStyle.Danger);

  const disputeBtn = new ButtonBuilder()
    .setCustomId(`1v1_log_dispute::${challengeActive?.id ?? "none"}`)
    .setLabel("Dispute")
    .setStyle(ButtonStyle.Primary);

  const closeBtn = new ButtonBuilder()
    .setCustomId("1v1_log_close")
    .setLabel("Close Ticket")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(winBtn, lossBtn, disputeBtn, closeBtn);

  const pingSet = new Set([`<@${userId}>`]);
  if (settings.pointsSupportRole) pingSet.add(`<@&${settings.pointsSupportRole}>`);
  if (settings.pointsRole)        pingSet.add(`<@&${settings.pointsRole}>`);

  const body = [
    `**user**    ·  <@${userId}>`,
    ...(challengeActive ? [
      `**vs**      ·  <@${challengeActive.challengerId === userId ? challengeActive.opponentId : challengeActive.challengerId}>`,
      `**spot**    ·  \`#${challengeActive.opponentSpot}\``,
    ] : []),
    ``,
    `drop your screenshot proof above — staff will log the result`,
  ].join("\n");

  const c = cv2WithHeader(DARK, "1v1 Log Ticket", body, "◈  1v1 log");

  await ch.send({
    content: [...pingSet].join(" "),
    components: [c, row],
    flags: MessageFlags.IsComponentsV2,
  });

  await replyFn({ content: `log ticket opened: <#${ch.id}>`, ephemeral: true });
}


export async function handleLogWin(
  interaction: ButtonInteraction,
  submitterId: string,
  challengeId: string,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const member = interaction.member as GuildMember | null;
  if (!canManage1v1(member, guild.id)) {
    await interaction.reply({ content: "you don't have permission.", ephemeral: true });
    return;
  }

  const guildId = guild.id;
  const challenge = challengeId !== "none" ? getChallenge(challengeId) : null;

  let winnerId: string;
  let loserId: string;
  let winnerSpot: number | null = null;
  let loserSpot: number | null = null;

  if (challenge) {
    winnerId  = submitterId;
    loserId   = challenge.challengerId === submitterId ? challenge.opponentId : challenge.challengerId;
    winnerSpot = submitterId === challenge.challengerId ? challenge.opponentSpot : challenge.challengerSpot;
    loserSpot  = submitterId === challenge.challengerId ? challenge.challengerSpot : challenge.opponentSpot;
  } else {
    winnerId  = submitterId;
    const winnerEntry = getPlayerEntry(guildId, winnerId);
    winnerSpot = winnerEntry?.spot ?? null;
    loserId   = "unknown";
    loserSpot = null;
  }

  const winnerEntry = getPlayerEntry(guildId, winnerId);
  const loserEntry  = loserId !== "unknown" ? getPlayerEntry(guildId, loserId) : null;

  let loserRemoved = false;
  if (loserEntry && winnerEntry) {
    if (winnerEntry.spot > loserEntry.spot) {
      swapSpots(guildId, winnerEntry.spot, loserEntry.spot);
    }
  } else if (!loserEntry && loserSpot) {
    loserRemoved = true;
  }

  applyWinnerCooldown(guildId, winnerId);
  if (loserId !== "unknown") applyCooldown(guildId, loserId);

  const matchId = logMatch(guildId, {
    winnerId,
    loserId,
    winnerSpot: winnerSpot ?? 0,
    loserSpot,
    loserRemoved,
    autoForfeit: false,
    challengeId: challenge?.id ?? null,
  });

  if (challenge) {
    clearChallengeFromPlayers(guildId, challenge);
    updateChallenge(challengeId, { status: "completed" });
    deleteChallenge(challengeId);
  }

  const body = [
    `**winner**  ·  <@${winnerId}>`,
    `**loser**   ·  ${loserId !== "unknown" ? `<@${loserId}>` : "unknown"}`,
    loserRemoved ? `**result**  ·  loser removed from board` : null,
    `**id**      ·  \`${matchId}\``,
  ].filter(Boolean).join("\n");

  const c = cv2WithHeader(GREEN, "Match Logged — Challenger Won", body, "◈  1v1 log");
  const payload = { components: [c], flags: MessageFlags.IsComponentsV2 };

  await interaction.update(payload as Parameters<typeof interaction.update>[0]);
  await postMatchResult(interaction.client, guildId, payload);
  await postTicketMessages(interaction.client, guildId, interaction.channel as TextChannel);
  await refreshLiveLeaderboard(interaction.client, guildId);

  setTimeout(async () => {
    await (interaction.channel as TextChannel | undefined)?.delete().catch(() => {});
  }, 5000);
}


export async function handleLogLoss(
  interaction: ButtonInteraction,
  submitterId: string,
  challengeId: string,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const member = interaction.member as GuildMember | null;
  if (!canManage1v1(member, guild.id)) {
    await interaction.reply({ content: "you don't have permission.", ephemeral: true });
    return;
  }

  const guildId = guild.id;
  const challenge = challengeId !== "none" ? getChallenge(challengeId) : null;

  let winnerId: string;
  let loserId: string;
  let winnerSpot: number | null = null;
  let loserSpot: number | null = null;

  if (challenge) {
    loserId   = submitterId;
    winnerId  = challenge.challengerId === submitterId ? challenge.opponentId : challenge.challengerId;
    loserSpot = submitterId === challenge.challengerId ? challenge.challengerSpot : challenge.opponentSpot;
    winnerSpot = submitterId === challenge.challengerId ? challenge.opponentSpot : challenge.challengerSpot;
  } else {
    loserId = submitterId;
    const loserEntry = getPlayerEntry(guildId, loserId);
    loserSpot = loserEntry?.spot ?? null;
    winnerId = "unknown";
    winnerSpot = null;
  }

  applyWinnerCooldown(guildId, winnerId !== "unknown" ? winnerId : submitterId);
  applyCooldown(guildId, loserId);

  const matchId = logMatch(guildId, {
    winnerId,
    loserId,
    winnerSpot: winnerSpot ?? 0,
    loserSpot,
    loserRemoved: false,
    autoForfeit: false,
    challengeId: challenge?.id ?? null,
  });

  if (challenge) {
    clearChallengeFromPlayers(guildId, challenge);
    updateChallenge(challengeId, { status: "completed" });
    deleteChallenge(challengeId);
  }

  const body = [
    `**winner**  ·  ${winnerId !== "unknown" ? `<@${winnerId}>` : "opponent"}`,
    `**loser**   ·  <@${loserId}>`,
    `**id**      ·  \`${matchId}\``,
  ].join("\n");

  const c = cv2WithHeader(RED, "Match Logged — Opponent Won", body, "◈  1v1 log");
  const payload = { components: [c], flags: MessageFlags.IsComponentsV2 };

  await interaction.update(payload as Parameters<typeof interaction.update>[0]);
  await postMatchResult(interaction.client, guildId, payload);
  await postTicketMessages(interaction.client, guildId, interaction.channel as TextChannel);
  await refreshLiveLeaderboard(interaction.client, guildId);

  setTimeout(async () => {
    await (interaction.channel as TextChannel | undefined)?.delete().catch(() => {});
  }, 5000);
}


export async function handleLogClose(interaction: ButtonInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const member = interaction.member as GuildMember | null;
  if (!canManage1v1(member, guild.id)) {
    await interaction.reply({ content: "you don't have permission.", ephemeral: true });
    return;
  }

  const c = cv2(DARK, "ticket closed by <@" + interaction.user.id + ">", "◈  1v1 log");
  await interaction.update({ components: [c], flags: MessageFlags.IsComponentsV2 });

  setTimeout(async () => {
    await (interaction.channel as TextChannel | undefined)?.delete().catch(() => {});
  }, 3000);
}


export async function handleLogDispute(interaction: ButtonInteraction, challengeId: string): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const body = [
    `**disputed by**  ·  <@${interaction.user.id}>`,
    `**challenge**    ·  \`${challengeId}\``,
    ``,
    `staff — review proof above and log the result manually`,
  ].join("\n");

  const c = cv2WithHeader(GOLD, "Match Disputed", body, "◈  1v1 dispute");
  await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
}


export async function handle1v1Set(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "server only.", ephemeral: true });
    return;
  }

  const guildId = interaction.guild.id;
  const member  = interaction.member as GuildMember | null;
  if (!canManage1v1(member, guildId)) {
    await interaction.reply({ content: "you don't have permission.", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "set") {
    const spot = interaction.options.getInteger("spot", true);
    const user = interaction.options.getUser("user", true);
    setPlayerAtSpot(guildId, spot, user.id);
    const c = cv2WithHeader(GREEN, "Spot Set", `**spot**  ·  \`#${spot}\`\n**user**  ·  <@${user.id}>`, "◈  1v1 admin");
    await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    await refreshLiveLeaderboard(interaction.client, guildId);

  } else if (sub === "remove") {
    const spot = interaction.options.getInteger("spot", true);
    removeFromSpot(guildId, spot);
    const c = cv2WithHeader(RED, "Spot Cleared", `**spot**  ·  \`#${spot}\`  is now open`, "◈  1v1 admin");
    await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    await refreshLiveLeaderboard(interaction.client, guildId);

  } else if (sub === "clearcooldown") {
    const user = interaction.options.getUser("user", true);
    const entry = getPlayerEntry(guildId, user.id);
    if (!entry) {
      await interaction.reply({ content: `<@${user.id}> isn't on the leaderboard.`, ephemeral: true });
      return;
    }
    clearCooldown(guildId, user.id);
    const c = cv2WithHeader(GREEN, "Cooldown Cleared", `cooldown cleared for <@${user.id}>`, "◈  1v1 admin");
    await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    await refreshLiveLeaderboard(interaction.client, guildId);

  } else if (sub === "setlog") {
    const ch = interaction.options.getChannel("channel", true) as TextChannel;
    setMatchLogChannel(guildId, ch.id);
    const c = cv2WithHeader(GREEN, "Log Channel Set", `match results will now be logged to <#${ch.id}>`, "◈  1v1 admin");
    await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2, ephemeral: true });

  } else if (sub === "pin") {
    const ch = interaction.options.getChannel("channel", true) as TextChannel;
    await interaction.deferReply({ ephemeral: true });
    const payload = build1v1Embed(guildId);
    const msg     = await ch.send(payload as never);
    setLiveLeaderboard(guildId, ch.id, msg.id);
    const c = cv2WithHeader(GREEN, "Leaderboard Pinned", `live leaderboard pinned to <#${ch.id}> — auto-updates after every match`, "◈  1v1 admin");
    await interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }
}


export async function handleHistory(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "server only.", ephemeral: true });
    return;
  }

  const guildId = interaction.guild.id;
  const target  = interaction.options.getUser("user") ?? interaction.user;
  const matches = getMatchHistory(guildId, target.id, 15);

  if (matches.length === 0) {
    const c = cv2(DARK, `no match history found for <@${target.id}>`, "◈  1v1 history");
    await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2, ephemeral: true });
    return;
  }

  const lines: string[] = [];
  for (const m of matches) {
    const won      = m.winnerId === target.id;
    const icon     = won ? "🟢" : "🔴";
    const other    = won ? m.loserId : m.winnerId;
    const result   = won ? "WIN" : (m.autoForfeit ? "FORFEIT" : "LOSS");
    const spotInfo = won
      ? `→ Spot #${m.winnerSpot}`
      : m.loserRemoved
        ? "removed from board"
        : m.loserSpot !== null ? `stayed at Spot #${m.loserSpot}` : "";
    lines.push(`${icon}  **${result}**  vs <@${other}>  ${spotInfo}  ·  ${fmtDate(m.timestamp)}`);
  }

  const c = cv2WithHeader(DARK, `Match History — ${target.username}`, lines.join("\n"), `◈  showing last ${matches.length} matches`);
  await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
}


export async function handleStats(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "server only.", ephemeral: true });
    return;
  }

  const guildId = interaction.guild.id;
  const target  = interaction.options.getUser("user") ?? interaction.user;
  const stats   = getPlayerStats(guildId, target.id);
  const total   = stats.wins + stats.losses;
  const rate    = total > 0 ? Math.round((stats.wins / total) * 100) : 0;

  const body = [
    `**current spot**  ·  ${stats.currentSpot !== null ? `Spot #${stats.currentSpot}` : "Unranked"}`,
    ``,
    `**wins**          ·  ${stats.wins}`,
    `**losses**        ·  ${stats.losses}`,
    `**forfeits**      ·  ${stats.forfeits}`,
    `**win rate**      ·  ${rate}%  (${total} total)`,
  ].join("\n");

  const c = cv2WithHeader(BLUE, `1v1 Stats — ${target.username}`, body, "◈  1v1 stats");
  await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
}


export async function handleLogRound(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) return;
  const member = interaction.member as GuildMember | null;
  if (!canManage1v1(member, interaction.guild.id)) {
    await interaction.reply({ content: "you don't have permission.", ephemeral: true });
    return;
  }

  const guildId    = interaction.guild.id;
  const input      = interaction.options.getString("attendees", true);
  const attendeeIds: string[] = [];
  for (const m of input.matchAll(/<@!?(\d+)>/g)) {
    if (m[1]) attendeeIds.push(m[1]);
  }

  if (attendeeIds.length === 0) {
    await interaction.reply({ content: "mention at least one attendee.", ephemeral: true });
    return;
  }

  const raidId = logRaid(guildId, attendeeIds);
  const lb     = getLeaderboard(guildId);

  const absentRanked: Array<{ userId: string; spot: number }> = [];
  for (const [spotStr, player] of Object.entries(lb)) {
    if (!attendeeIds.includes(player.userId)) {
      const attended = getAttendanceInLastN(guildId, player.userId, 2);
      if (attended === 0) {
        absentRanked.push({ userId: player.userId, spot: Number(spotStr) });
      }
    }
  }

  let warningBlock = "";
  if (absentRanked.length > 0) {
    warningBlock = "\n\n⚠️  **at risk — missed 2+ raids:**\n" +
      absentRanked.map((a) => `  • <@${a.userId}>  Spot #${a.spot}`).join("\n");

    for (const a of absentRanked) {
      const user = await interaction.client.users.fetch(a.userId).catch(() => null);
      if (user) {
        const dmBody = [
          `you've missed 2 raids in a row`,
          `**spot**  ·  \`#${a.spot}\`  is at risk`,
          `miss another one and staff can remove your spot`,
        ].join("\n");
        const dmC = cv2WithHeader(RED, "⚠️  Attendance Warning", dmBody, "◈  1v1");
        await user.send({ components: [dmC], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }
    }
  }

  const body = `**id**         ·  \`${raidId}\`\n**attendees**  ·  ${attendeeIds.map((id) => `<@${id}>`).join(", ")}${warningBlock}`;
  const c = cv2WithHeader(GREEN, "Raid Logged", body, "◈  1v1 raid log");
  await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
}


export async function checkExpiredChallenges(client: Client): Promise<void> {
  const warningSoon = getPendingChallengesWarningSoon();
  for (const challenge of warningSoon) {
    try {
      markWarningSent(challenge.guildId, challenge.id);
      const minsLeft = Math.max(1, Math.round((challenge.expiresAt - Date.now()) / 60_000));

      const challenger = await client.users.fetch(challenge.challengerId).catch(() => null);
      if (challenger) {
        const c = cv2WithHeader(GOLD, "⏳  Challenge Expiring Soon",
          `your challenge against <@${challenge.opponentId}> expires in ~${minsLeft} minutes\nif they don't accept in time it auto-forfeits — you take the loss`,
          "◈  1v1 expiry warning");
        await challenger.send({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }

      const opponent = await client.users.fetch(challenge.opponentId).catch(() => null);
      if (opponent) {
        const c = cv2WithHeader(GOLD, "⏳  Challenge Expiring Soon",
          `pending challenge from <@${challenge.challengerId}> expires in ~${minsLeft} minutes\naccept or decline before it runs out`,
          "◈  1v1 expiry warning");
        await opponent.send({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }
    } catch { /* ignore */ }
  }

  const expired = getExpiredPendingChallenges();

  for (const challenge of expired) {
    try {
      const guild = client.guilds.cache.get(challenge.guildId);
      if (!guild) { deleteChallenge(challenge.id); continue; }

      updateChallenge(challenge.id, { status: "completed" });

      applyCooldown(challenge.guildId, challenge.opponentId);
      applyCooldown(challenge.guildId, challenge.challengerId);

      const matchId = logMatch(challenge.guildId, {
        winnerId:    challenge.opponentId,
        loserId:     challenge.challengerId,
        winnerSpot:  challenge.opponentSpot,
        loserSpot:   challenge.challengerSpot,
        loserRemoved: false,
        autoForfeit:  true,
        challengeId:  challenge.id,
      });

      const forfeitBody = [
        `<@${challenge.challengerId}> ran out of time`,
        `<@${challenge.opponentId}> keeps Spot #${challenge.opponentSpot}`,
        `both get a 2 day cooldown`,
        `**id**  ·  \`${matchId}\``,
      ].join("\n");

      const forfeitC = cv2WithHeader(RED, "Auto Forfeit", forfeitBody, "◈  1v1");
      const forfeitPayload = { components: [forfeitC], flags: MessageFlags.IsComponentsV2 };

      const channel = guild.channels.cache.get(challenge.channelId) as TextChannel | undefined;
      if (channel) {
        await channel.send(forfeitPayload as never).catch(() => {});
      }

      await postMatchResult(client, challenge.guildId, forfeitPayload);

      const challenger = await client.users.fetch(challenge.challengerId).catch(() => null);
      if (challenger) {
        const c = cv2WithHeader(RED, "Challenge Timed Out",
          `your challenge against <@${challenge.opponentId}> timed out\nauto loss + 2 day cooldown applied`,
          "◈  1v1");
        await challenger.send({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }

      const opponent = await client.users.fetch(challenge.opponentId).catch(() => null);
      if (opponent) {
        const c = cv2WithHeader(GREEN, "Match Concluded",
          `<@${challenge.challengerId}> didn't finish the match in time\nyou keep Spot #${challenge.opponentSpot} — 2 day cooldown applied to both of you`,
          "◈  1v1");
        await opponent.send({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }

      deleteChallenge(challenge.id);

      await refreshLiveLeaderboard(client, challenge.guildId);
    } catch { /* skip individual errors */ }
  }
}


export async function handleTop(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "server only.", ephemeral: true });
    return;
  }

  const guildId = interaction.guild.id;
  const all     = getMatchHistory(guildId, undefined, 500);

  if (all.length === 0) {
    const c = cv2(DARK, "no matches logged yet", "◈  1v1 top");
    await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    return;
  }

  const playerMap = new Map<string, { wins: number; losses: number; forfeits: number }>();
  for (const m of all) {
    if (!playerMap.has(m.winnerId)) playerMap.set(m.winnerId, { wins: 0, losses: 0, forfeits: 0 });
    if (!playerMap.has(m.loserId))  playerMap.set(m.loserId,  { wins: 0, losses: 0, forfeits: 0 });
    playerMap.get(m.winnerId)!.wins++;
    playerMap.get(m.loserId)!.losses++;
    if (m.autoForfeit) playerMap.get(m.loserId)!.forfeits++;
  }

  const sorted = [...playerMap.entries()]
    .sort((a, b) => {
      const totalA = a[1].wins + a[1].losses;
      const totalB = b[1].wins + b[1].losses;
      const rateA  = totalA > 0 ? a[1].wins / totalA : 0;
      const rateB  = totalB > 0 ? b[1].wins / totalB : 0;
      if (b[1].wins !== a[1].wins) return b[1].wins - a[1].wins;
      return rateB - rateA;
    })
    .slice(0, 10);

  const MEDALS = ["🥇", "🥈", "🥉"];
  const lines  = sorted.map(([userId, s], idx) => {
    const total = s.wins + s.losses;
    const rate  = total > 0 ? Math.round((s.wins / total) * 100) : 0;
    const medal = MEDALS[idx] ?? `\`${idx + 1}.\``;
    const lb    = getPlayerEntry(guildId, userId);
    const spot  = lb ? `  ·  Spot #${lb.spot}` : "";
    return `${medal}  <@${userId}>${spot}  —  **${s.wins}W / ${s.losses}L**  (${rate}%)`;
  });

  const c = cv2WithHeader(GOLD, "All-Time Top Players", lines.join("\n"), `◈  ${all.length} total matches logged`);
  await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
}


export async function sendLogPanel(channel: TextChannel, _guildId: string): Promise<void> {
  const openBtn = new ButtonBuilder()
    .setCustomId("open_log_ticket")
    .setLabel("Open Log Ticket")
    .setStyle(ButtonStyle.Primary);

  const body = [
    `click below to open a match log ticket`,
    `include screenshot proof of the result`,
    `staff will review and update the leaderboard`,
  ].join("\n");

  const c = cv2WithHeader(DARK, "Logs", body, "◈  1v1 logs");
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(openBtn);

  await channel.send({ components: [c, row], flags: MessageFlags.IsComponentsV2 });
}


function clearChallengeFromPlayers(
  guildId: string,
  challenge: { challengerId: string; opponentId: string; opponentSpot: number; challengerSpot: number | null; id: string },
): void {
  const lb = getLeaderboard(guildId);
  if (challenge.opponentSpot && lb[String(challenge.opponentSpot)]?.pendingChallengeId === challenge.id) {
    lb[String(challenge.opponentSpot)]!.pendingChallengeId = null;
  }
  if (challenge.challengerSpot && lb[String(challenge.challengerSpot)]?.pendingChallengeId === challenge.id) {
    lb[String(challenge.challengerSpot)]!.pendingChallengeId = null;
  }
  saveLeaderboard(guildId, lb);
}
