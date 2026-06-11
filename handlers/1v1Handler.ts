import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
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
  clearCooldown,
  isOnCooldown,
  createChallenge,
  getChallenge,
  updateChallenge,
  deleteChallenge,
  getExpiredPendingChallenges,
  getActiveChallengeBetween,
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
  TWO_DAYS_MS,
  type RankedPlayer,
  type MatchRecord,
} from "../utils/1v1Storage.js";
import { getGuild, getWhitelist } from "../utils/storage.js";
import { logInfo } from "../utils/botLogger.js";

const SEP  = "———————————————————";
const DARK = 0x1a1a2e;
const GREEN = 0x2ecc71;
const RED   = 0xe74c3c;
const GOLD  = 0xf1c40f;
const BLUE  = 0x3498db;

const LOG_CATEGORY_ID    = "1514692597308981289";
export const TAG_CATEGORY_ID    = "1474702146309062770";
export const VERIFY_CATEGORY_ID = "1474701312762446057";

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

// ── live leaderboard refresh ──────────────────────────────────────────────────

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
    const embed = build1v1Embed(guildId);
    await msg.edit({ embeds: [embed] });
  } catch { /* ignore */ }
}

// ── post match result to log channel ─────────────────────────────────────────

async function postMatchResult(
  client: Client,
  guildId: string,
  embed: object,
): Promise<void> {
  try {
    const channelId = getMatchLogChannel(guildId);
    if (!channelId) return;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const ch = guild.channels.cache.get(channelId) as TextChannel | undefined;
    if (!ch) return;
    await ch.send({ embeds: [embed] });
  } catch { /* ignore */ }
}

// ── leaderboard embed ─────────────────────────────────────────────────────────

export function build1v1Embed(guildId: string): object {
  const lb = getLeaderboard(guildId);
  const lines: string[] = [];

  for (let spot = 1; spot <= 5; spot++) {
    const player = lb[String(spot)];
    lines.push(SEP);
    if (!player) {
      lines.push(`✅  **Spot #${spot}** — Open`);
    } else {
      const onCD      = isOnCooldown(player);
      const hasPending = !!player.pendingChallengeId;
      let icon = "✅";
      if (onCD) icon = "🛡️";
      else if (hasPending) icon = "⚔️";

      let line = `${icon}  <@${player.userId}> — Spot #${spot}`;
      if (onCD && player.cooldownUntil) {
        line += `  📆 ${fmtDate(player.cooldownUntil)}`;
      }
      lines.push(line);
    }
  }
  lines.push(SEP);

  return {
    title: "/FAZEE TOP 5 PLAYERS",
    color: DARK,
    description: lines.join("\n"),
    footer: {
      text: [
        "🛡️ on cooldown  |  ✅ can be challenged  |  ⚔️ match in progress  |  📆 cooldown ends on this date",
        "losing gives you a 2 day cooldown — challenges that go 48hrs without a result are auto forfeited",
      ].join("\n"),
    },
    timestamp: ts(),
  };
}

// ── /challenge command ────────────────────────────────────────────────────────

export async function handleChallengeCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "this only works in a server.", ephemeral: true });
    return;
  }

  const guildId  = interaction.guild.id;
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

  const embed = {
    color: GOLD,
    description: [
      SEP,
      `  **1v1 Challenge**`,
      SEP,
      `  <@${interaction.user.id}>  (${spotLabel})  →  <@${opponent.id}>  (Spot #${opponentSpot})`,
      SEP,
      `  <@${opponent.id}> accept or decline below`,
      `  you got 48hrs to respond or this gets auto-cancelled`,
      SEP,
    ].join("\n"),
    footer: { text: "◈  1v1" },
    timestamp: ts(),
  };

  await interaction.reply({ embeds: [embed], components: [row] });
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

// ── accept button ─────────────────────────────────────────────────────────────

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

  await interaction.update({
    embeds: [{
      color: GREEN,
      description: [
        SEP,
        `  **Challenge Accepted**`,
        SEP,
        `  <@${challenge.challengerId}> vs <@${challenge.opponentId}>  (Spot #${challenge.opponentSpot})`,
        SEP,
        `  go play your match then open a log ticket to submit proof`,
        `  you got 48hrs — if no result is logged the challenger takes the auto loss`,
        SEP,
      ].join("\n"),
      footer: { text: "◈  1v1" },
      timestamp: ts(),
    }],
    components: [],
  });
}

// ── decline button ────────────────────────────────────────────────────────────

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

  await interaction.update({
    embeds: [{
      color: RED,
      description: [
        SEP,
        `  **Challenge Declined**`,
        SEP,
        `  <@${challenge.opponentId}> declined the challenge from <@${challenge.challengerId}>`,
        SEP,
      ].join("\n"),
      footer: { text: "◈  1v1 system" },
      timestamp: ts(),
    }],
    components: [],
  });
}

// ── log ticket ────────────────────────────────────────────────────────────────

export async function openLogTicket(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  guild: Guild,
): Promise<void> {
  const userId   = interaction.user.id;
  const settings = getGuild(guild.id);

  const channelPerms: import("discord.js").OverwriteResolvable[] = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: userId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
  ];

  const vmrRoleIds: string[] = [
    ...(settings.verificationManagerRoles ?? []),
    ...(settings.verificationManagerRole ? [settings.verificationManagerRole] : []),
  ];
  for (const roleId of vmrRoleIds) {
    if (guild.roles.cache.has(roleId)) {
      channelPerms.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    }
  }
  if (settings.pointsRole && guild.roles.cache.has(settings.pointsRole)) {
    channelPerms.push({ id: settings.pointsRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }

  let logCategory = guild.channels.cache.get(LOG_CATEGORY_ID) ?? null;
  if (!logCategory) {
    logCategory = await guild.channels.fetch(LOG_CATEGORY_ID).catch(() => null);
  }

  const ch = (await guild.channels.create({
    name: `log-${interaction.user.username}`,
    type: ChannelType.GuildText,
    parent: logCategory?.id,
    permissionOverwrites: channelPerms,
  })) as TextChannel;

  const challengerEntry    = getPlayerEntry(guild.id, userId);
  const challengeActive    = challengerEntry?.player.pendingChallengeId
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

  const closeBtn = new ButtonBuilder()
    .setCustomId("1v1_log_close")
    .setLabel("Close Ticket")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(winBtn, lossBtn, closeBtn);

  const pingParts: string[] = [`<@${userId}>`];
  if (settings.pointsSupportRole) pingParts.push(`<@&${settings.pointsSupportRole}>`);
  if (settings.pointsRole)        pingParts.push(`<@&${settings.pointsRole}>`);

  const challengeInfo = challengeActive
    ? [
        `  active challenge  ·  <@${challengeActive.challengerId}> vs <@${challengeActive.opponentId}>`,
        `  spot in play      ·  **#${challengeActive.opponentSpot}**`,
      ]
    : [`  no active challenge found — staff can still manually update ranks`];

  await ch.send({
    content: pingParts.join(" "),
    embeds: [{
      color: DARK,
      description: [
        SEP,
        `  **1v1 Log Ticket**`,
        SEP,
        `  submitted by  ·  <@${userId}>`,
        ...challengeInfo,
        SEP,
        `  drop your screenshot proof above, staff will take it from there`,
        SEP,
      ].join("\n"),
      footer: { text: "◈  1v1 log" },
      timestamp: ts(),
    }],
    components: [row],
  });

  if (interaction.isButton()) {
    await interaction.reply({ content: `log ticket opened: <#${ch.id}>`, ephemeral: true });
  } else {
    await (interaction as ChatInputCommandInteraction).reply({ content: `log ticket opened: <#${ch.id}>`, ephemeral: true });
  }
}

// ── log win handler ───────────────────────────────────────────────────────────

export async function handleLogWin(
  interaction: ButtonInteraction,
  submitterId: string,
  challengeId: string,
): Promise<void> {
  if (!interaction.guild) return;
  const member = interaction.member as GuildMember | null;
  if (!canManage1v1(member, interaction.guild.id)) {
    await interaction.reply({ content: "you're not staff, you can't do this.", ephemeral: true });
    return;
  }

  const challenge = challengeId !== "none" ? getChallenge(challengeId) : null;
  if (!challenge) {
    await interaction.reply({ content: "no challenge linked to this ticket. use `/1v1set` to update ranks manually.", ephemeral: true });
    return;
  }

  await finalizeChallengerWin(interaction.guild.id, challenge, interaction);

  await (interaction.channel as TextChannel)?.send({
    embeds: [{
      color: GREEN,
      description: [SEP, `  result logged  ·  ticket closing in 5s`, SEP].join("\n"),
      footer: { text: "◈  1v1 log" }, timestamp: ts(),
    }],
  }).catch(() => {});

  setTimeout(async () => {
    await (interaction.channel as TextChannel)?.delete().catch(() => {});
  }, 5000);

  await refreshLiveLeaderboard(interaction.client, interaction.guild.id);
}

// ── log loss handler ──────────────────────────────────────────────────────────

export async function handleLogLoss(
  interaction: ButtonInteraction,
  submitterId: string,
  challengeId: string,
): Promise<void> {
  if (!interaction.guild) return;
  const member = interaction.member as GuildMember | null;
  if (!canManage1v1(member, interaction.guild.id)) {
    await interaction.reply({ content: "you're not staff, you can't do this.", ephemeral: true });
    return;
  }

  const challenge = challengeId !== "none" ? getChallenge(challengeId) : null;
  if (!challenge) {
    await interaction.reply({ content: "no challenge linked to this ticket. use `/1v1set` to update ranks manually.", ephemeral: true });
    return;
  }

  await finalizeOpponentWin(interaction.guild.id, challenge, interaction);

  await (interaction.channel as TextChannel)?.send({
    embeds: [{
      color: RED,
      description: [SEP, `  result logged  ·  ticket closing in 5s`, SEP].join("\n"),
      footer: { text: "◈  1v1 log" }, timestamp: ts(),
    }],
  }).catch(() => {});

  setTimeout(async () => {
    await (interaction.channel as TextChannel)?.delete().catch(() => {});
  }, 5000);

  await refreshLiveLeaderboard(interaction.client, interaction.guild.id);
}

// ── close ticket button ───────────────────────────────────────────────────────

export async function handleLogClose(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild) return;
  const member = interaction.member as GuildMember | null;
  if (!canManage1v1(member, interaction.guild.id)) {
    await interaction.reply({ content: "only staff can close log tickets.", ephemeral: true });
    return;
  }
  await interaction.reply({ content: "closing...", ephemeral: true });
  setTimeout(async () => {
    await (interaction.channel as TextChannel)?.delete().catch(() => {});
  }, 2000);
}

// ── rank logic: challenger wins ───────────────────────────────────────────────

async function finalizeChallengerWin(
  guildId: string,
  challenge: { id: string; challengerId: string; opponentId: string; opponentSpot: number; challengerSpot: number | null },
  interaction: ButtonInteraction,
): Promise<void> {
  const { challengerId, opponentId, opponentSpot, challengerSpot } = challenge;

  if (challengerSpot !== null) {
    swapSpots(guildId, challengerSpot, opponentSpot);
    const lb = getLeaderboard(guildId);
    if (lb[String(opponentSpot)])  lb[String(opponentSpot)]!.pendingChallengeId  = null;
    if (lb[String(challengerSpot)]) {
      lb[String(challengerSpot)]!.cooldownUntil       = Date.now() + TWO_DAYS_MS;
      lb[String(challengerSpot)]!.pendingChallengeId  = null;
    }
    saveLeaderboard(guildId, lb);
  } else {
    const lb = getLeaderboard(guildId);
    delete lb[String(opponentSpot)];
    lb[String(opponentSpot)] = { userId: challengerId, spot: opponentSpot, cooldownUntil: null, pendingChallengeId: null };
    saveLeaderboard(guildId, lb);
    applyCooldown(guildId, opponentId);
  }

  deleteChallenge(challenge.id);

  const matchId = logMatch(guildId, {
    winnerId:     challengerId,
    loserId:      opponentId,
    winnerSpot:   opponentSpot,
    loserSpot:    challengerSpot,
    loserRemoved: challengerSpot === null,
    autoForfeit:  false,
    challengeId:  challenge.id,
  });

  const resultEmbed = {
    color: GREEN,
    description: [
      SEP,
      `  **Challenger Won**`,
      SEP,
      `  winner  ·  <@${challengerId}>  now at Spot #${opponentSpot}`,
      challengerSpot !== null
        ? `  loser   ·  <@${opponentId}>  dropped to Spot #${challengerSpot}  — 2 day cooldown`
        : `  loser   ·  <@${opponentId}>  got bumped off the board`,
      `  id  ·  \`${matchId}\``,
      SEP,
    ].join("\n"),
    footer: { text: "◈  1v1" },
    timestamp: ts(),
  };

  await interaction.update({ embeds: [resultEmbed], components: [] });

  await postMatchResult(interaction.client, guildId, resultEmbed);

  const loser = await interaction.client.users.fetch(opponentId).catch(() => null);
  if (loser) {
    await loser.send({
      embeds: [{
        color: RED,
        description: [
          SEP,
          `  you lost your 1v1 against <@${challengerId}>`,
          challengerSpot !== null
            ? `  dropped to Spot #${challengerSpot} — 2 day cooldown`
            : `  bumped off the leaderboard`,
          SEP,
        ].join("\n"),
        footer: { text: "◈  1v1" }, timestamp: ts(),
      }],
    }).catch(() => {});
  }
}

// ── rank logic: opponent wins ─────────────────────────────────────────────────

async function finalizeOpponentWin(
  guildId: string,
  challenge: { id: string; challengerId: string; opponentId: string; opponentSpot: number; challengerSpot: number | null },
  interaction: ButtonInteraction,
): Promise<void> {
  const { challengerId, opponentId, opponentSpot, challengerSpot } = challenge;

  applyCooldown(guildId, opponentId);
  applyCooldown(guildId, challengerId);

  deleteChallenge(challenge.id);

  const matchId = logMatch(guildId, {
    winnerId:     opponentId,
    loserId:      challengerId,
    winnerSpot:   opponentSpot,
    loserSpot:    challengerSpot,
    loserRemoved: false,
    autoForfeit:  false,
    challengeId:  challenge.id,
  });

  const resultEmbed = {
    color: RED,
    description: [
      SEP,
      `  **Defender Won**`,
      SEP,
      `  <@${opponentId}>  holds Spot #${opponentSpot}  — 2 day cooldown`,
      `  <@${challengerId}>  ${challengerSpot !== null ? `back to Spot #${challengerSpot}` : "stays unranked"}  — 2 day cooldown`,
      `  id  ·  \`${matchId}\``,
      SEP,
    ].join("\n"),
    footer: { text: "◈  1v1" },
    timestamp: ts(),
  };

  await interaction.update({ embeds: [resultEmbed], components: [] });

  await postMatchResult(interaction.client, guildId, resultEmbed);
}

// ── /1v1set command ───────────────────────────────────────────────────────────

export async function handle1v1Set(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) return;
  const member = interaction.member as GuildMember | null;
  if (!canManage1v1(member, interaction.guild.id)) {
    await interaction.reply({ content: "you don't have permission.", ephemeral: true });
    return;
  }

  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;

  if (sub === "add") {
    const user = interaction.options.getUser("user", true);
    const spot = interaction.options.getInteger("spot", true);
    const existing = getPlayerBySpot(guildId, spot);
    if (existing) {
      await interaction.reply({ content: `spot #${spot} is occupied by <@${existing.userId}>. remove them first.`, ephemeral: true });
      return;
    }
    setPlayerAtSpot(guildId, spot, { userId: user.id, spot, cooldownUntil: null, pendingChallengeId: null });
    await interaction.reply({
      embeds: [{
        color: GREEN,
        description: `${SEP}\n  placed <@${user.id}> at Spot #${spot}\n${SEP}`,
        footer: { text: "◈  1v1 admin" }, timestamp: ts(),
      }],
    });
    await refreshLiveLeaderboard(interaction.client, guildId);

  } else if (sub === "remove") {
    const user  = interaction.options.getUser("user", true);
    const entry = getPlayerEntry(guildId, user.id);
    if (!entry) {
      await interaction.reply({ content: `<@${user.id}> isn't on the leaderboard.`, ephemeral: true });
      return;
    }
    removeFromSpot(guildId, entry.spot);
    await interaction.reply({
      embeds: [{
        color: RED,
        description: `${SEP}\n  removed <@${user.id}> from Spot #${entry.spot}\n${SEP}`,
        footer: { text: "◈  1v1 admin" }, timestamp: ts(),
      }],
    });
    await refreshLiveLeaderboard(interaction.client, guildId);

  } else if (sub === "cooldown") {
    const user  = interaction.options.getUser("user", true);
    const entry = getPlayerEntry(guildId, user.id);
    if (!entry) {
      await interaction.reply({ content: `<@${user.id}> isn't on the leaderboard.`, ephemeral: true });
      return;
    }
    applyCooldown(guildId, user.id);
    const until = new Date(Date.now() + TWO_DAYS_MS);
    await interaction.reply({
      embeds: [{
        color: DARK,
        description: `${SEP}\n  cooldown applied to <@${user.id}> until **${fmtDate(until.getTime())}**\n${SEP}`,
        footer: { text: "◈  1v1 admin" }, timestamp: ts(),
      }],
    });
    await refreshLiveLeaderboard(interaction.client, guildId);

  } else if (sub === "clearcooldown") {
    const user  = interaction.options.getUser("user", true);
    const entry = getPlayerEntry(guildId, user.id);
    if (!entry) {
      await interaction.reply({ content: `<@${user.id}> isn't on the leaderboard.`, ephemeral: true });
      return;
    }
    clearCooldown(guildId, user.id);
    await interaction.reply({
      embeds: [{
        color: GREEN,
        description: `${SEP}\n  cooldown cleared for <@${user.id}>\n${SEP}`,
        footer: { text: "◈  1v1 admin" }, timestamp: ts(),
      }],
    });
    await refreshLiveLeaderboard(interaction.client, guildId);

  } else if (sub === "setlog") {
    const ch = interaction.options.getChannel("channel", true) as TextChannel;
    setMatchLogChannel(guildId, ch.id);
    await interaction.reply({
      embeds: [{
        color: GREEN,
        description: `${SEP}\n  match results will now be logged to <#${ch.id}>\n${SEP}`,
        footer: { text: "◈  1v1 admin" }, timestamp: ts(),
      }],
      ephemeral: true,
    });

  } else if (sub === "pin") {
    const ch = interaction.options.getChannel("channel", true) as TextChannel;
    await interaction.deferReply({ ephemeral: true });
    const embed = build1v1Embed(guildId);
    const msg   = await ch.send({ embeds: [embed] });
    setLiveLeaderboard(guildId, ch.id, msg.id);
    await interaction.editReply({
      embeds: [{
        color: GREEN,
        description: `${SEP}\n  live leaderboard pinned to <#${ch.id}> — it will auto-update after every match\n${SEP}`,
        footer: { text: "◈  1v1 admin" }, timestamp: ts(),
      }],
    });
  }
}

// ── /1v1history command ───────────────────────────────────────────────────────

export async function handleHistory(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "server only.", ephemeral: true });
    return;
  }

  const guildId = interaction.guild.id;
  const target  = interaction.options.getUser("user") ?? interaction.user;
  const matches = getMatchHistory(guildId, target.id, 15);

  if (matches.length === 0) {
    await interaction.reply({
      embeds: [{
        color: DARK,
        description: `${SEP}\n  no match history found for <@${target.id}>\n${SEP}`,
        footer: { text: "◈  1v1 history" }, timestamp: ts(),
      }],
      ephemeral: true,
    });
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

  await interaction.reply({
    embeds: [{
      color: DARK,
      title: `Match History — ${target.username}`,
      description: [SEP, ...lines, SEP].join("\n"),
      footer: { text: `◈  showing last ${matches.length} matches` },
      timestamp: ts(),
    }],
  });
}

// ── /1v1stats command ─────────────────────────────────────────────────────────

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

  await interaction.reply({
    embeds: [{
      color: BLUE,
      title: `1v1 Stats — ${target.username}`,
      description: [
        SEP,
        `  current spot  ·  ${stats.currentSpot !== null ? `**Spot #${stats.currentSpot}**` : "Unranked"}`,
        SEP,
        `  wins          ·  **${stats.wins}**`,
        `  losses        ·  **${stats.losses}**`,
        `  forfeits      ·  **${stats.forfeits}**`,
        `  win rate      ·  **${rate}%**  (${total} total)`,
        SEP,
      ].join("\n"),
      footer: { text: "◈  1v1 stats" },
      timestamp: ts(),
    }],
  });
}

// ── /loground (raid logging) ──────────────────────────────────────────────────

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

  let warning = "";
  if (absentRanked.length > 0) {
    warning = "\n\n⚠️ **These players missed 2+ raids, their spot is at risk:**\n" +
      absentRanked.map((a) => `  • <@${a.userId}> — Spot #${a.spot}`).join("\n");

    for (const a of absentRanked) {
      const user = await interaction.client.users.fetch(a.userId).catch(() => null);
      if (user) {
        await user.send({
          embeds: [{
            color: RED,
            description: [
              SEP,
              `  heads up, you've missed 2 raids in a row`,
              `  your Spot #${a.spot} is at risk of being taken`,
              `  miss another one and staff can remove your spot`,
              SEP,
            ].join("\n"),
            footer: { text: "◈  1v1" }, timestamp: ts(),
          }],
        }).catch(() => {});
      }
    }
  }

  await interaction.reply({
    embeds: [{
      color: GREEN,
      description: [
        SEP,
        `  **Raid Logged**  ·  \`${raidId}\``,
        SEP,
        `  attendees  ·  ${attendeeIds.map((id) => `<@${id}>`).join(", ")}`,
        SEP,
      ].join("\n") + warning,
      footer: { text: "◈  1v1 raid log" }, timestamp: ts(),
    }],
  });
}

// ── auto-forfeit expired challenges ──────────────────────────────────────────

export async function checkExpiredChallenges(client: Client): Promise<void> {
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

      const forfeitEmbed = {
        color: RED,
        description: [
          SEP,
          `  **Auto Forfeit**`,
          SEP,
          `  <@${challenge.challengerId}> ran out of time`,
          `  <@${challenge.opponentId}> keeps Spot #${challenge.opponentSpot}`,
          `  both get a 2 day cooldown`,
          `  id  ·  \`${matchId}\``,
          SEP,
        ].join("\n"),
        footer: { text: "◈  1v1" },
        timestamp: ts(),
      };

      const channel = guild.channels.cache.get(challenge.channelId) as TextChannel | undefined;
      if (channel) {
        await channel.send({ embeds: [forfeitEmbed] }).catch(() => {});
      }

      await postMatchResult(client, challenge.guildId, forfeitEmbed);

      const challenger = await client.users.fetch(challenge.challengerId).catch(() => null);
      if (challenger) {
        await challenger.send({
          embeds: [{
            color: RED,
            description: [
              SEP,
              `  your challenge against <@${challenge.opponentId}> timed out`,
              `  auto loss + 2 day cooldown applied to your account`,
              SEP,
            ].join("\n"),
            footer: { text: "◈  1v1" }, timestamp: ts(),
          }],
        }).catch(() => {});
      }

      const opponent = await client.users.fetch(challenge.opponentId).catch(() => null);
      if (opponent) {
        await opponent.send({
          embeds: [{
            color: GREEN,
            description: [
              SEP,
              `  <@${challenge.challengerId}> didn't finish the match in time`,
              `  you keep Spot #${challenge.opponentSpot} — 2 day cooldown applied to both of you`,
              SEP,
            ].join("\n"),
            footer: { text: "◈  1v1" }, timestamp: ts(),
          }],
        }).catch(() => {});
      }

      deleteChallenge(challenge.id);

      await refreshLiveLeaderboard(client, challenge.guildId);
    } catch { /* skip individual errors */ }
  }
}

// ── /1v1top command ───────────────────────────────────────────────────────────

export async function handleTop(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "server only.", ephemeral: true });
    return;
  }

  const guildId = interaction.guild.id;
  const all     = getMatchHistory(guildId, undefined, 500);

  if (all.length === 0) {
    await interaction.reply({
      embeds: [{
        color: DARK,
        description: `${SEP}\n  no matches logged yet\n${SEP}`,
        footer: { text: "◈  1v1 top" }, timestamp: ts(),
      }],
    });
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
    const medal = MEDALS[idx] ?? `${idx + 1}.`;
    const lb    = getPlayerEntry(guildId, userId);
    const spot  = lb ? ` · Spot #${lb.spot}` : "";
    return `${medal}  <@${userId}>${spot}  —  **${s.wins}W / ${s.losses}L**  (${rate}%)`;
  });

  await interaction.reply({
    embeds: [{
      color: GOLD,
      title: "All-Time Top Players",
      description: [SEP, ...lines, SEP].join("\n"),
      footer: { text: `◈  ${all.length} total matches logged` },
      timestamp: ts(),
    }],
  });
}

// ── log panel ─────────────────────────────────────────────────────────────────

export async function sendLogPanel(channel: TextChannel, guildId: string): Promise<void> {
  const openBtn = new ButtonBuilder()
    .setCustomId("open_log_ticket")
    .setLabel("Open Log Ticket")
    .setStyle(ButtonStyle.Primary);

  await channel.send({
    embeds: [{
      color: DARK,
      description: [
        SEP,
        `  **Logs**`,
        SEP,
        `  click below to open a match log ticket`,
        `  include screenshot proof of the result`,
        `  staff will review and update the leaderboard`,
        SEP,
      ].join("\n"),
      footer: { text: "◈  1v1 logs" },
      timestamp: ts(),
    }],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(openBtn)],
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

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
