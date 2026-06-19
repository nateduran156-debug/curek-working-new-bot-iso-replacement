import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  ModalBuilder,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Client,
  type Guild,
  type Interaction,
  type TextChannel,
  type Message,
} from "discord.js";
import {
  getGuild,
  getTickets,
  setTicket,
  isBlacklisted,
  deleteTicket,
  addTicketMessage,
  memberHasTagManagerRole,
  memberHasVerificationManagerRole,
  getWhitelist,
  getPoints,
  savePoints,
  type TicketData,
} from "../utils/storage.js";
import { refreshLeaderboard } from "../utils/leaderboard.js";
import {
  getUserByUsername,
  getUserGroups,
  isInGroup,
  giveRobloxTagRole,
  kickFromGroup,
} from "../utils/roblox.js";
import { generateTranscript } from "../utils/transcript.js";
import { logTicket } from "../utils/botLogger.js";

const TAG_GROUP_ID = "396910998";

const KICK_ON_DENY_TAGS: Record<string, string> = {
  "sharingan tag": TAG_GROUP_ID,
  "rockstar": TAG_GROUP_ID,
  "dark": TAG_GROUP_ID,
  "faze": TAG_GROUP_ID,
  "fraid": TAG_GROUP_ID,
};

async function kickDeniedUser(robloxUsername: string, tag: string): Promise<void> {
  const groupId = KICK_ON_DENY_TAGS[tag.toLowerCase()];
  if (!groupId || !robloxUsername) return;
  const user = await getUserByUsername(robloxUsername).catch(() => null);
  if (!user) return;
  await kickFromGroup(groupId, user.id).catch(() => {});
}

const WHITE = 0x6366f1;
const GREEN = 0x34d399;
const RED   = 0xf43f5e;

const TAG_OPTIONS = [
  { label: "Sharingan Tag", value: "sharingan tag", description: "sharingan tag request" },
  { label: "Rockstar", value: "rockstar", description: "rockstar tag request" },
  { label: "Dark", value: "dark", description: "dark tag request" },
  { label: "FaZe", value: "faze", description: "faze tag request" },
  { label: "Fraid", value: "fraid", description: "fraid tag request" },
  { label: "Member", value: "member", description: "strip back to member" },
];

const TAG_GROUP_MSG = `### TAG GROUP —> https://www.roblox.com/communities/${TAG_GROUP_ID}`;

const OWNER_IDS = new Set(["1472482602215538779", "1456824205545967713", "1490246846583537787"]);

const now = () => new Date().toISOString();

function canManageTags(
  member: import("discord.js").GuildMember | null | undefined,
  guildId: string,
): boolean {
  if (!member) return false;
  if (OWNER_IDS.has(member.id)) return true;
  const wl = getWhitelist();
  if ((wl["bot"] ?? []).includes(member.id)) return true;
  // tag managers AND verification managers can both approve/deny tags
  if (memberHasTagManagerRole(member, guildId)) return true;
  if (memberHasVerificationManagerRole(member, guildId)) return true;
  return false;
}

async function getDiscordAvatar(guild: Guild, userId: string): Promise<string | null> {
  try {
    const member =
      guild.members.cache.get(userId) ??
      (await guild.members.fetch(userId).catch(() => null));
    return member?.displayAvatarURL({ size: 256 }) ?? null;
  } catch {
    return null;
  }
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


export async function sendTicketPanel(
  channel: TextChannel,
  type: "verification" | "tag" | "both" | "1v1",
) {
  if (type === "1v1") {
    const button = new ButtonBuilder()
      .setCustomId("open_log_ticket")
      .setLabel("open log ticket")
      .setStyle(ButtonStyle.Primary);

    const c = cv2WithHeader(WHITE, "1v1 Log Tickets",
      "both players click the button after your match\na shared ticket opens automatically when both of you click\ndrop your proof and staff will log the result",
      "◈  1v1 log system");

    await channel.send({
      components: [c, new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  if (type === "both") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_select")
      .setPlaceholder("open a ticket...")
      .addOptions([
        { label: "verification ticket", description: "get verified with your roblox account", value: "verification" },
        { label: "tag ticket", description: "request a roblox tag", value: "tag" },
      ]);

    const c = cv2WithHeader(WHITE, "Support Tickets", "select a category below to open a ticket", "◈  x2k");
    await channel.send({
      components: [c, new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
      flags: MessageFlags.IsComponentsV2,
    });
  } else if (type === "tag") {
    const button = new ButtonBuilder()
      .setCustomId("open_ticket_tag")
      .setLabel("open tag ticket")
      .setStyle(ButtonStyle.Secondary);

    const c = cv2WithHeader(WHITE, "Tag Tickets", "click the button below to open a tag ticket", "◈  tag system");
    await channel.send({
      components: [c, new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
      flags: MessageFlags.IsComponentsV2,
    });
  } else {
    const button = new ButtonBuilder()
      .setCustomId("open_ticket_verification")
      .setLabel("open verification ticket")
      .setStyle(ButtonStyle.Secondary);

    const c = cv2WithHeader(WHITE, "Verification", "click the button below to link your roblox account and get verified", "◈  verification system");
    await channel.send({
      components: [c, new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
      flags: MessageFlags.IsComponentsV2,
    });
  }
}


export async function showVerificationModal(interaction: Interaction): Promise<void> {
  if (!("showModal" in interaction)) return;

  const buttonInteraction = interaction as import("discord.js").ButtonInteraction;

  const openTickets = getTickets();
  const existingTicket = Object.values(openTickets).find(
    (ticket) =>
      ticket.userId === buttonInteraction.user.id &&
      ticket.guildId === buttonInteraction.guild?.id &&
      ticket.type === "verification",
  );

  if (existingTicket) {
    const existingChannel = buttonInteraction.guild?.channels.cache.get(existingTicket.channelId);
    if (existingChannel) {
      await buttonInteraction.reply({
        content: `you already have a ticket open: <#${existingChannel.id}>`,
        ephemeral: true,
      });
      return;
    }
  }

  const modal = new ModalBuilder()
    .setCustomId("verification_username_modal")
    .setTitle("Verification Ticket");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("roblox_username")
        .setLabel("Roblox Username")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("your roblox username")
        .setRequired(true),
    ),
  );

  await buttonInteraction.showModal(modal);
}


export async function openVerificationTicket(
  interaction: Interaction,
  guild: Guild,
  robloxUsername: string,
) {
  const modalInteraction = interaction as import("discord.js").ModalSubmitInteraction;
  const settings = getGuild(guild.id);

  const categoryId = "1474701312762446057";
  const category = guild.channels.cache.get(categoryId) ?? null;

  const FALLBACK_VMR = "1493484814215413771";
  const vmrRoleIds: string[] = [
    ...(settings.verificationManagerRoles ?? []),
    ...(settings.verificationManagerRole ? [settings.verificationManagerRole] : []),
  ];
  if (vmrRoleIds.length === 0) {
    vmrRoleIds.push(FALLBACK_VMR);
  }

  const channelPermissions: import("discord.js").OverwriteResolvable[] = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: modalInteraction.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
  ];

  for (const roleId of vmrRoleIds) {
    if (guild.roles.cache.has(roleId)) {
      channelPermissions.push({
        id: roleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      });
    }
  }

  if (settings.tagManagerRole && guild.roles.cache.has(settings.tagManagerRole)) {
    channelPermissions.push({
      id: settings.tagManagerRole,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  const ticketChannel = (await guild.channels.create({
    name: `ticket-${modalInteraction.user.username}`,
    type: ChannelType.GuildText,
    parent: (category as import("discord.js").CategoryChannel)?.id,
    permissionOverwrites: channelPermissions,
  })) as TextChannel;

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("ticket_verify").setLabel("Verify").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("ticket_accept_group").setLabel("Accept into Group").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket_kick").setLabel("Kick").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ticket_close").setLabel("Close Ticket").setStyle(ButtonStyle.Secondary),
  );

  const rolePings = vmrRoleIds.map((id) => `<@&${id}>`).join(" ");

  const body = [
    `**user**    ·  <@${modalInteraction.user.id}>`,
    `**roblox**  ·  \`${robloxUsername}\``,
    `**status**  ·  waiting on staff`,
    ``,
    `someone will get to you soon.`,
  ].join("\n");

  const c = cv2WithHeader(WHITE, "Verification Ticket", body, "◈  verification system");

  const message = await ticketChannel.send({
    content: `<@${modalInteraction.user.id}> ${rolePings}`,
    components: [c, buttonRow],
    flags: MessageFlags.IsComponentsV2,
  });

  const ticketData: TicketData = {
    channelId: ticketChannel.id,
    userId: modalInteraction.user.id,
    guildId: guild.id,
    type: "verification",
    robloxUsername,
    messageId: message.id,
    messages: [
      {
        author: "System",
        authorId: "0",
        content: `Verification ticket opened by ${modalInteraction.user.username} — roblox: ${robloxUsername}`,
        timestamp: Date.now(),
      },
    ],
    openedAt: Date.now(),
    status: "open",
  };
  setTicket(ticketChannel.id, ticketData);

  await logTicket(guild.id, "Verification Ticket Opened", `<@${modalInteraction.user.id}> opened a verification ticket`, [
    { name: "Roblox", value: robloxUsername, inline: true },
    { name: "Channel", value: `<#${ticketChannel.id}>`, inline: true },
  ]);

  const blEntry = isBlacklisted(robloxUsername);
  if (blEntry) {
    const blBody = [
      `\`${robloxUsername}\`  is blacklisted`,
      ``,
      `**reason**  ·  ${blEntry.reason || "no reason given"}`,
      `**by**      ·  <@${blEntry.addedById}>`,
      `**date**    ·  <t:${Math.floor(blEntry.addedAt / 1000)}:D>`,
    ].join("\n");
    const blC = cv2WithHeader(RED, "⚠️  Blacklisted User", blBody, "◈  verification system");
    await ticketChannel.send({ components: [blC], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  }

  await runGroupCheck(ticketChannel, robloxUsername, guild.id, modalInteraction.client);
  await modalInteraction.editReply({ content: `ticket opened: <#${ticketChannel.id}>` });
}


export async function openTagChannel(interaction: Interaction) {
  const tagInteraction = interaction as
    | import("discord.js").ButtonInteraction
    | import("discord.js").StringSelectMenuInteraction;

  const openTickets = getTickets();
  const existingTicket = Object.values(openTickets).find(
    (ticket) =>
      ticket.userId === tagInteraction.user.id &&
      ticket.guildId === tagInteraction.guild?.id &&
      ticket.type === "tag",
  );

  if (existingTicket) {
    const existingChannel = tagInteraction.guild?.channels.cache.get(existingTicket.channelId);
    if (existingChannel) {
      return tagInteraction.reply({
        content: `you already have a tag ticket open: <#${existingChannel.id}>`,
        ephemeral: true,
      });
    }
  }

  const guild = tagInteraction.guild!;
  const settings = getGuild(guild.id);

  const categoryId = "1474702146309062770";
  const category = guild.channels.cache.get(categoryId) ?? null;

  const channelPermissions: import("discord.js").OverwriteResolvable[] = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: tagInteraction.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
  ];

  if (settings.tagManagerRole && guild.roles.cache.has(settings.tagManagerRole)) {
    channelPermissions.push({
      id: settings.tagManagerRole,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  const ticketChannel = (await guild.channels.create({
    name: `tag-${tagInteraction.user.username}`,
    type: ChannelType.GuildText,
    parent: (category as import("discord.js").CategoryChannel)?.id,
    permissionOverwrites: channelPermissions,
  })) as TextChannel;

  const tagMenu = new StringSelectMenuBuilder()
    .setCustomId("in_channel_tag_select")
    .setPlaceholder("pick a tag...")
    .addOptions(TAG_OPTIONS);

  const c = cv2WithHeader(WHITE, "Tag Ticket", "pick a tag from the dropdown below", "◈  tag system");
  await ticketChannel.send({
    content: `<@${tagInteraction.user.id}> <@&1494364609140752554>`,
    components: [c, new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(tagMenu)],
    flags: MessageFlags.IsComponentsV2,
  });

  const ticketData: TicketData = {
    channelId: ticketChannel.id,
    userId: tagInteraction.user.id,
    guildId: guild.id,
    type: "tag",
    messageId: undefined,
    messages: [
      {
        author: "System",
        authorId: "0",
        content: `Tag ticket opened by ${tagInteraction.user.username}`,
        timestamp: Date.now(),
      },
    ],
    openedAt: Date.now(),
    status: "open",
  };
  setTicket(ticketChannel.id, ticketData);

  await logTicket(guild.id, "Tag Ticket Opened", `<@${tagInteraction.user.id}> opened a tag ticket`, [
    { name: "Channel", value: `<#${ticketChannel.id}>`, inline: true },
  ]);

  return tagInteraction.reply({
    content: `tag ticket opened: <#${ticketChannel.id}>`,
    ephemeral: true,
  });
}


export async function handleInChannelTagSelect(
  interaction: import("discord.js").StringSelectMenuInteraction,
) {
  const selectedTag = interaction.values[0]!;

  const modal = new ModalBuilder()
    .setCustomId(`tag_ticket_modal::${selectedTag}`)
    .setTitle(`${selectedTag} tag request`);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("roblox_username")
        .setLabel("Roblox Username")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("your roblox username")
        .setRequired(true),
    ),
  );

  await interaction.showModal(modal);
}


export async function postTagReviewEmbed(
  interaction: import("discord.js").ModalSubmitInteraction,
  tag: string,
  robloxUsername: string,
): Promise<void> {
  const guildId = interaction.guild!.id;
  const allTickets = getTickets();
  const channelId = interaction.channelId ?? "";
  const ticket = channelId ? allTickets[channelId] : undefined;

  if (!ticket) {
    await interaction.reply({
      content: "couldn't find the ticket for this channel.",
      ephemeral: true,
    });
    return;
  }

  ticket.requestedTag = tag;
  ticket.robloxUsername = robloxUsername;
  ticket.status = "open";
  setTicket(ticket.channelId, ticket);

  await interaction.deferReply();

  const reviewButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("ticket_tag_approve").setLabel("Approve").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("ticket_tag_deny").setLabel("Deny").setStyle(ButtonStyle.Danger),
  );

  const body = [
    `**user**    ·  <@${interaction.user.id}>`,
    `**roblox**  ·  \`${robloxUsername}\``,
    `**tag**     ·  \`${tag}\``,
  ].join("\n");

  const c = cv2WithHeader(WHITE, "Pending Review", body, "◈  tag system");

  await interaction.editReply({
    components: [c, reviewButtons],
    flags: MessageFlags.IsComponentsV2,
  });

  if (tag.toLowerCase() !== "member") {
    const ticketChannel = interaction.channel as TextChannel | null;
    await ticketChannel?.send({ content: TAG_GROUP_MSG }).catch(() => {});
  }

  await logTicket(
    guildId,
    "Tag Request Submitted",
    `<@${interaction.user.id}> submitted a tag request — waiting for review`,
    [
      { name: "Roblox", value: robloxUsername, inline: true },
      { name: "Tag", value: tag, inline: true },
    ],
  );
}


export async function handleTagApprove(
  interaction: import("discord.js").ButtonInteraction,
): Promise<void> {
  const allTickets = getTickets();
  const ticket = allTickets[interaction.channelId];

  if (!ticket) {
    await interaction.reply({ content: "can't find this ticket.", ephemeral: true });
    return;
  }

  const member = interaction.member as import("discord.js").GuildMember | null;
  if (!canManageTags(member, interaction.guild!.id)) {
    await interaction.reply({ content: "you don't have permission to approve tag requests.", ephemeral: true });
    return;
  }

  const tag = ticket.requestedTag ?? "no tag";
  const robloxUsername = ticket.robloxUsername ?? "";

  await interaction.deferReply();

  const result = await giveRobloxTagRole(robloxUsername, tag);

  if (!result.ok) {
    const retryButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("ticket_tag_approve").setLabel("Retry Approve").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("ticket_tag_deny").setLabel("Deny").setStyle(ButtonStyle.Danger),
    );

    const body = [
      `**user**    ·  <@${ticket.userId}>`,
      `**roblox**  ·  \`${robloxUsername}\``,
      `**tag**     ·  \`${tag}\``,
      `**error**   ·  ${result.reason}`,
      ``,
      `check the tag group and try again, or deny the request`,
    ].join("\n");

    const c = cv2WithHeader(RED, "Roblox-Side Error", body, "◈  tag system");
    await interaction.editReply({ components: [c, retryButtons], flags: MessageFlags.IsComponentsV2 });
    return;
  }

  ticket.status = "approved";
  ticket.closedAt = Date.now();
  ticket.closedBy = interaction.user.username;
  ticket.closedById = interaction.user.id;
  ticket.approvedBy = interaction.user.username;
  ticket.approvedById = interaction.user.id;
  setTicket(ticket.channelId, ticket);

  const body = [
    `**user**    ·  <@${ticket.userId}>`,
    `**roblox**  ·  \`${robloxUsername}\``,
    `**tag**     ·  \`${tag}\``,
    `**by**      ·  <@${interaction.user.id}>`,
  ].join("\n");

  const c = cv2WithHeader(GREEN, "Approved", body, "◈  tag system");
  await interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 });

  await logTicket(
    interaction.guild!.id,
    "Tag Approved",
    `<@${interaction.user.id}> approved the tag request for <@${ticket.userId}>`,
    [
      { name: "Roblox", value: robloxUsername, inline: true },
      { name: "Tag", value: tag, inline: true },
    ],
  );

  const approvedUser = await interaction.client.users.fetch(ticket.userId).catch(() => null);
  if (approvedUser) {
    const dmBody = [
      `**tag**     ·  \`${tag}\``,
      `**roblox**  ·  \`${robloxUsername}\``,
      `**by**      ·  <@${interaction.user.id}>`,
      ``,
      `you've been ranked in the group, go check your roles.`,
    ].join("\n");
    const dmC = cv2WithHeader(GREEN, "Tag Approved", dmBody, "◈  tag system");
    await approvedUser.send({ components: [dmC], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  }

  setTimeout(async () => {
    await sendTagLog(interaction.client, interaction.guild!, ticket);
    await postCloseLog(interaction.client, interaction.guild!, ticket);
    deleteTicket(ticket.channelId);
    const channel = interaction.guild?.channels.cache.get(ticket.channelId);
    await (channel as TextChannel)?.delete().catch(() => {});
  }, 5000);
}


export async function handleTagDeny(
  interaction: import("discord.js").ButtonInteraction,
): Promise<void> {
  const allTickets = getTickets();
  const ticket = allTickets[interaction.channelId];

  if (!ticket) {
    await interaction.reply({ content: "can't find this ticket.", ephemeral: true });
    return;
  }

  const member = interaction.member as import("discord.js").GuildMember | null;
  if (!canManageTags(member, interaction.guild!.id)) {
    await interaction.reply({ content: "you don't have permission to deny tag requests.", ephemeral: true });
    return;
  }

  const tag = ticket.requestedTag ?? "no tag";
  const robloxUsername = ticket.robloxUsername ?? "";

  ticket.status = "denied";
  ticket.closedAt = Date.now();
  ticket.closedBy = interaction.user.username;
  ticket.closedById = interaction.user.id;
  setTicket(ticket.channelId, ticket);

  const body = [
    `**user**    ·  <@${ticket.userId}>`,
    `**roblox**  ·  \`${robloxUsername}\``,
    `**tag**     ·  \`${tag}\``,
    `**by**      ·  <@${interaction.user.id}>`,
  ].join("\n");

  const c = cv2WithHeader(RED, "Denied", body, "◈  tag system");
  await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });

  await logTicket(
    interaction.guild!.id,
    "Tag Denied",
    `<@${interaction.user.id}> denied the tag request for <@${ticket.userId}>`,
    [
      { name: "Roblox", value: robloxUsername, inline: true },
      { name: "Tag", value: tag, inline: true },
    ],
  );

  await kickDeniedUser(robloxUsername, tag);

  const deniedUser = await interaction.client.users.fetch(ticket.userId).catch(() => null);
  if (deniedUser) {
    const dmBody = [
      `**tag**     ·  \`${tag}\``,
      `**roblox**  ·  \`${robloxUsername}\``,
      `**by**      ·  <@${interaction.user.id}>`,
      ``,
      `if you think this was a mistake, open a new ticket.`,
    ].join("\n");
    const dmC = cv2WithHeader(RED, "Tag Denied", dmBody, "◈  tag system");
    await deniedUser.send({ components: [dmC], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  }

  setTimeout(async () => {
    await sendTagLog(interaction.client, interaction.guild!, ticket);
    await postCloseLog(interaction.client, interaction.guild!, ticket);
    deleteTicket(ticket.channelId);
    const channel = interaction.guild?.channels.cache.get(ticket.channelId);
    await (channel as TextChannel)?.delete().catch(() => {});
  }, 5000);
}


export async function closeTicket(
  interaction: import("discord.js").ButtonInteraction,
  ticket: TicketData,
  reason: string | null,
): Promise<void> {
  const guild = interaction.guild!;

  ticket.status = "closed";
  ticket.closedAt = Date.now();
  ticket.closedBy = interaction.user.username;
  ticket.closedById = interaction.user.id;
  setTicket(ticket.channelId, ticket);

  const body = reason
    ? `ticket closed by <@${interaction.user.id}>\n**reason**  ·  ${reason}`
    : `ticket closed by <@${interaction.user.id}>`;
  const c = cv2(0x4f46e5, body, "◈  ticket system");
  await interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 });

  await postCloseLog(interaction.client, guild, ticket);

  setTimeout(async () => {
    deleteTicket(ticket.channelId);
    const channel = guild.channels.cache.get(ticket.channelId);
    await (channel as TextChannel)?.delete().catch(() => {});
  }, 5000);
}


async function runGroupCheck(
  channel: TextChannel,
  robloxUsername: string,
  guildId: string,
  client: import("discord.js").Client,
): Promise<void> {
  try {
    const settings = getGuild(guildId);
    const user = await getUserByUsername(robloxUsername).catch(() => null);
    if (!user) return;

    const groups = await getUserGroups(user.id).catch(() => [] as import("../utils/roblox.js").RobloxGroup[]);
    const mainGroupId = settings.groupId ?? "703716156";
    const inGroup = await isInGroup(user.id, mainGroupId).catch(() => false);

    const guildFlaggedIds = settings.flaggedGroups ?? [];
    const ALWAYS_FLAGGED_IDS = new Set([
      "650907997","16848719","214730861","33861944","495825805",
      "862795072","32564331","265955381","15957207","1024109775",
      "872867055","34546804","489845165","91960354","580313332",
      "339952823","575770529","140364569",
    ]);

    const flaggedHits = groups.filter((g: import("../utils/roblox.js").RobloxGroup) =>
      guildFlaggedIds.includes(String(g.group.id)) || ALWAYS_FLAGGED_IDS.has(String(g.group.id)),
    );

    const embeds: object[] = [];

    const groupList = groups.length > 0
      ? groups.map((g: import("../utils/roblox.js").RobloxGroup) => `• [${g.group.name}](https://www.roblox.com/groups/${g.group.id})`).join("\n")
      : "• none";

    const profileUrl = `https://www.roblox.com/users/${user.id}/profile`;
    const mainBody = `**[${user.name}](${profileUrl})**\n\n**Groups**\n${groupList}`;
    const color = flaggedHits.length > 0 ? 0xf43f5e : inGroup ? 0x34d399 : 0x6366f1;
    embeds.push(cv2(color, mainBody, "◈  group check"));

    if (flaggedHits.length > 0) {
      const flaggedLines = flaggedHits
        .map((entry: import("../utils/roblox.js").RobloxGroup) => `• [${entry.group.name}](https://www.roblox.com/groups/${entry.group.id})`)
        .join("\n");
      embeds.push(cv2WithHeader(0xf43f5e, "⚠️  Flagged Groups",
        `flagged groups — ask them to leave before verifying\n\n${flaggedLines}`,
        "◈  verification system"));
    }

    const groupBody = inGroup
      ? `✓ **[${user.name}](${profileUrl})** is in the group and good to verify\n\n**group id**  ·  \`${mainGroupId}\`\n**link**      ·  [Join Here](https://www.roblox.com/communities/${mainGroupId})`
      : `✗ **[${user.name}](${profileUrl})** is not in the group\n\n**group id**  ·  \`${mainGroupId}\`\n**link**      ·  [Join Here](https://www.roblox.com/communities/${mainGroupId})`;
    embeds.push(cv2(color, groupBody));

    for (const e of embeds) {
      await channel.send({ components: [e as never], flags: MessageFlags.IsComponentsV2 });
    }
  } catch { /* ignore */ }
}


async function sendTagLog(client: Client, guild: Guild, ticket: TicketData) {
  const settings = getGuild(guild.id);
  const logChannelId = settings.tagLogChannel ?? settings.logChannel;
  if (!logChannelId) return;

  const logChannel = guild.channels.cache.get(logChannelId) as TextChannel | undefined;
  if (!logChannel) return;

  const avatarUrl = await getDiscordAvatar(guild, ticket.userId);
  const transcript = generateTranscript(ticket);

  const isApproved = ticket.status === "approved";
  const descLines = [
    `**User**  ·  <@${ticket.userId}>  (\`${ticket.userId}\`)`,
    `**Roblox**  ·  \`${ticket.robloxUsername ?? "unknown"}\``,
    `**Tag**  ·  \`${ticket.requestedTag ?? "?"}\``,
    ...(ticket.approvedBy ? [`**Approved By**  ·  ${ticket.approvedBy}`] : []),
    ...(ticket.closedBy && ticket.status === "denied" ? [`**Denied By**  ·  ${ticket.closedBy}`] : []),
  ];

  const c = new ContainerBuilder().setAccentColor(isApproved ? 0x34d399 : 0xf43f5e);
  if (avatarUrl) {
    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${isApproved ? "Tag Approved" : "Tag Denied"}**`))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
    c.addSectionComponents(section);
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  } else {
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${isApproved ? "Tag Approved" : "Tag Denied"}**`));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  }
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(descLines.join("\n")));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ◈  tag system`));

  await logChannel
    .send({
      components: [c],
      flags: MessageFlags.IsComponentsV2,
      files: [{ attachment: transcript, name: `tag-transcript-${ticket.channelId}.html` }],
    })
    .catch(() => {});
}


export async function showRaidPointModal(interaction: Interaction): Promise<void> {
  if (!("showModal" in interaction)) return;

  const buttonInteraction = interaction as import("discord.js").ButtonInteraction;

  const modal = new ModalBuilder()
    .setCustomId("raid_point_modal")
    .setTitle("Raid Point Request");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("roblox_username")
        .setLabel("Roblox Username")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("your roblox username")
        .setRequired(true),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("proof_url")
        .setLabel("Screenshot URL")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("paste a direct link to your raid screenshot")
        .setRequired(true),
    ),
  );

  await buttonInteraction.showModal(modal);
}


export async function openRaidPointTicket(
  interaction: import("discord.js").ModalSubmitInteraction,
  guild: Guild,
  robloxUsername: string,
  proofUrl: string,
): Promise<void> {
  const guildId = guild.id;
  const settings = getGuild(guildId);

  const openTickets = getTickets();
  const existingTicket = Object.values(openTickets).find(
    (ticket) =>
      ticket.userId === interaction.user.id &&
      ticket.guildId === guildId &&
      ticket.type === "raidpoint",
  );

  if (existingTicket) {
    const existingChannel = guild.channels.cache.get(existingTicket.channelId);
    if (existingChannel) {
      await interaction.editReply({ content: `you already have a request open: <#${existingChannel.id}>` });
      return;
    }
  }

  const channelPermissions: import("discord.js").OverwriteResolvable[] = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
  ];

  if (settings.pointsSupportRole && guild.roles.cache.has(settings.pointsSupportRole)) {
    channelPermissions.push({
      id: settings.pointsSupportRole,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  if (settings.pointsRole && guild.roles.cache.has(settings.pointsRole)) {
    channelPermissions.push({
      id: settings.pointsRole,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  const ticketChannel = (await guild.channels.create({
    name: `raid-${interaction.user.username}`,
    type: ChannelType.GuildText,
    permissionOverwrites: channelPermissions,
  })) as TextChannel;

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("raid_approve").setLabel("Approve").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("raid_deny").setLabel("Deny").setStyle(ButtonStyle.Danger),
  );

  const pingParts: string[] = [`<@${interaction.user.id}>`];
  if (settings.pointsSupportRole) pingParts.push(`<@&${settings.pointsSupportRole}>`);
  if (settings.pointsRole) pingParts.push(`<@&${settings.pointsRole}>`);

  const body = [
    `**submitted by**  ·  <@${interaction.user.id}> (${interaction.user.username})`,
    `**roblox**        ·  \`${robloxUsername}\``,
    `**proof**         ·  ${proofUrl}`,
  ].join("\n");

  const c = cv2WithHeader(WHITE, "Raid Point Request", body, "◈  points system");
  await ticketChannel.send({
    content: pingParts.join(" "),
    components: [c, buttonRow],
    flags: MessageFlags.IsComponentsV2,
  });

  const ticketData: TicketData = {
    channelId: ticketChannel.id,
    userId: interaction.user.id,
    guildId,
    type: "raidpoint",
    robloxUsername,
    proofUrl,
    messageId: undefined,
    messages: [
      {
        author: "System",
        authorId: "0",
        content: `Raid point request by ${interaction.user.username} — roblox: ${robloxUsername}`,
        timestamp: Date.now(),
      },
    ],
    openedAt: Date.now(),
    status: "open",
  };
  setTicket(ticketChannel.id, ticketData);

  await interaction.editReply({ content: `your request has been submitted: <#${ticketChannel.id}>` });
}


export async function handleRaidApprove(
  interaction: import("discord.js").ButtonInteraction,
): Promise<void> {
  const allTickets = getTickets();
  const ticket = allTickets[interaction.channelId];

  if (!ticket) {
    await interaction.reply({ content: "couldn't find this request.", ephemeral: true });
    return;
  }

  const member = interaction.member as import("discord.js").GuildMember | null;
  const guildId = interaction.guild!.id;
  const settings = getGuild(guildId);

  const isOwner = OWNER_IDS.has(interaction.user.id);
  const wl = getWhitelist();
  const isWlBot = (wl["bot"] ?? []).includes(interaction.user.id);
  const hasPSR = !!settings.pointsSupportRole && !!member?.roles.cache.has(settings.pointsSupportRole);
  const hasPR = !!settings.pointsRole && !!member?.roles.cache.has(settings.pointsRole);

  if (!isOwner && !isWlBot && !hasPSR && !hasPR) {
    await interaction.reply({ content: "you're not staff, you can't do that.", ephemeral: true });
    return;
  }

  const points = getPoints(guildId);
  points[ticket.userId] = (points[ticket.userId] ?? 0) + 1;
  savePoints(guildId, points);

  ticket.status = "approved";
  ticket.closedAt = Date.now();
  ticket.closedBy = interaction.user.username;
  ticket.closedById = interaction.user.id;
  setTicket(ticket.channelId, ticket);

  const newTotal = points[ticket.userId] ?? 0;
  const pointLabel = newTotal !== 1 ? "pts" : "pt";

  const body = [
    `raid point approved for <@${ticket.userId}>`,
    `**total**  ·  **${newTotal}** ${pointLabel}`,
    `**by**     ·  <@${interaction.user.id}>`,
  ].join("\n");

  const c = cv2WithHeader(WHITE, "Approved", body, "◈  points system");
  await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });

  refreshLeaderboard(interaction.client, guildId).catch(() => {});

  setTimeout(async () => {
    deleteTicket(ticket.channelId);
    const channel = interaction.guild?.channels.cache.get(ticket.channelId);
    await (channel as TextChannel)?.delete().catch(() => {});
  }, 4000);
}


export async function handleRaidDeny(
  interaction: import("discord.js").ButtonInteraction,
): Promise<void> {
  const allTickets = getTickets();
  const ticket = allTickets[interaction.channelId];

  if (!ticket) {
    await interaction.reply({ content: "couldn't find this request.", ephemeral: true });
    return;
  }

  const member = interaction.member as import("discord.js").GuildMember | null;
  const guildId = interaction.guild!.id;
  const settings = getGuild(guildId);

  const isOwner = OWNER_IDS.has(interaction.user.id);
  const wlDeny = getWhitelist();
  const isWlBotDeny = (wlDeny["bot"] ?? []).includes(interaction.user.id);
  const hasPSR = !!settings.pointsSupportRole && !!member?.roles.cache.has(settings.pointsSupportRole);
  const hasPR = !!settings.pointsRole && !!member?.roles.cache.has(settings.pointsRole);

  if (!isOwner && !isWlBotDeny && !hasPSR && !hasPR) {
    await interaction.reply({ content: "you're not staff, you can't do that.", ephemeral: true });
    return;
  }

  ticket.status = "denied";
  ticket.closedAt = Date.now();
  ticket.closedBy = interaction.user.username;
  ticket.closedById = interaction.user.id;
  setTicket(ticket.channelId, ticket);

  const c = cv2WithHeader(WHITE, "Denied",
    `raid point request denied by <@${interaction.user.id}>`,
    "◈  points system");
  await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });

  setTimeout(async () => {
    deleteTicket(ticket.channelId);
    const channel = interaction.guild?.channels.cache.get(ticket.channelId);
    await (channel as TextChannel)?.delete().catch(() => {});
  }, 4000);
}


export async function autoCloseIdleTickets(client: Client): Promise<void> {
  const allTickets = getTickets();
  const IDLE_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const [channelId, ticket] of Object.entries(allTickets)) {
    if (ticket.status !== "open") continue;

    const lastActivity =
      ticket.messages.length > 0
        ? Math.max(...ticket.messages.map((m) => m.timestamp))
        : ticket.openedAt;

    if (now - lastActivity < IDLE_MS) continue;

    const guild = client.guilds.cache.get(ticket.guildId);
    if (!guild) { deleteTicket(channelId); continue; }

    const channel = guild.channels.cache.get(channelId) as TextChannel | null;

    const ticketUser = await client.users.fetch(ticket.userId).catch(() => null);
    if (ticketUser) {
      const dmBody = [
        `your **${ticket.type}** ticket was automatically closed after 24 hours of inactivity`,
        ...(ticket.robloxUsername ? [`**roblox**  ·  \`${ticket.robloxUsername}\``] : []),
        ``,
        `if you still need help, open a new ticket anytime`,
      ].join("\n");
      const dmC = cv2WithHeader(0x4f46e5, "Ticket Auto-Closed", dmBody, "◈  /curek");
      await ticketUser.send({ components: [dmC], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }

    if (channel) {
      const c = cv2(0x4f46e5, "this ticket has been automatically closed due to 24 hours of inactivity", "◈  /curek");
      await channel.send({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }

    ticket.status = "closed";
    ticket.closedAt = now;
    ticket.closedBy = "Auto-Close";
    ticket.closedById = "0";
    setTicket(channelId, ticket);

    await postCloseLog(client, guild, ticket);

    setTimeout(async () => {
      deleteTicket(channelId);
      await channel?.delete().catch(() => {});
    }, 3000);
  }
}


async function postCloseLog(client: Client, guild: Guild, ticket: TicketData) {
  const settings = getGuild(guild.id);
  const logChannelId = settings.logChannel;
  if (!logChannelId) return;

  const logChannel = guild.channels.cache.get(logChannelId) as TextChannel | undefined;
  if (!logChannel) return;

  const avatarUrl = await getDiscordAvatar(guild, ticket.userId);
  const transcript = generateTranscript(ticket);

  const descLines = [
    `**User**  ·  <@${ticket.userId}>  (\`${ticket.userId}\`)`,
    `**Type**  ·  ${ticket.type}`,
    ...(ticket.robloxUsername ? [`**Roblox**  ·  \`${ticket.robloxUsername}\``] : []),
    ...(ticket.requestedTag ? [`**Tag**  ·  \`${ticket.requestedTag}\``] : []),
    `**Status**  ·  ${ticket.status ?? "closed"}`,
    ...(ticket.closedBy ? [`**Closed By**  ·  ${ticket.closedBy}`] : []),
  ];

  const c = new ContainerBuilder().setAccentColor(WHITE);
  if (avatarUrl) {
    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("**Ticket Closed**"))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
    c.addSectionComponents(section);
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  } else {
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent("**Ticket Closed**"));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  }
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(descLines.join("\n")));

  await logChannel
    .send({
      components: [c],
      flags: MessageFlags.IsComponentsV2,
      files: [{ attachment: transcript, name: `transcript-${ticket.channelId}.html` }],
    })
    .catch(() => {});
}

