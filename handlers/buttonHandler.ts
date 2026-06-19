import { PermissionFlagsBits, type Interaction, type GuildMember, type TextChannel } from "discord.js";
import {
  handleChallengeAccept,
  handleChallengeDecline,
  handleLogWin,
  handleLogLoss,
  handleLogClose,
  handleLogDispute,
  openLogTicket,
} from "./1v1Handler.js";
import {
  getTickets,
  setVerified,
  getGuild,
  getWhitelist,
  memberHasVerificationManagerRole,
  memberHasTagManagerRole,
  getRegistered,
} from "../utils/storage.js";
import { getUserByUsername, isInGroup, acceptJoinRequest } from "../utils/roblox.js";
import { logCommand } from "../utils/botLogger.js";
import { isQueueActive, addJoiner } from "../utils/queue.js";
import {
  showVerificationModal,
  openVerificationTicket,
  openTagChannel,
  handleInChannelTagSelect,
  postTagReviewEmbed,
  handleTagApprove,
  handleTagDeny,
  closeTicket,
  showRaidPointModal,
  openRaidPointTicket,
  handleRaidApprove,
  handleRaidDeny,
} from "./ticketHandler.js";
import { buildHelpMessage } from "../utils/help.js";

const OWNER_IDS = new Set(["1456824205545967713", "1490246846583537787"]);

// fetch a fresh guild member so we always have up-to-date roles
// interaction.member can sometimes be partial if the member joined after the bot started
async function getFreshMember(interaction: { guild: import("discord.js").Guild | null; user: { id: string } }): Promise<GuildMember | null> {
  if (!interaction.guild) return null;
  try {
    return await interaction.guild.members.fetch(interaction.user.id);
  } catch {
    return null;
  }
}

// can this person handle verification tickets (verify, kick, accept group)
function isVerificationStaff(member: GuildMember, guildId: string): boolean {
  if (OWNER_IDS.has(member.id)) return true;
  const wl = getWhitelist();
  if ((wl["bot"] ?? []).includes(member.id)) return true;
  return memberHasVerificationManagerRole(member, guildId);
}

// can this person close any ticket (verification staff + tag managers)
function canClose(member: GuildMember, guildId: string): boolean {
  if (isVerificationStaff(member, guildId)) return true;
  return memberHasTagManagerRole(member, guildId);
}

export async function handleButton(interaction: Interaction) {
  const customId = "customId" in interaction ? (interaction as { customId: string }).customId : "";

  // modal submissions
  if (interaction.isModalSubmit()) {
    if (customId === "verification_username_modal") {
      const username = interaction.fields.getTextInputValue("roblox_username").trim();
      if (!username) return interaction.reply({ content: "enter your roblox username.", ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      return openVerificationTicket(interaction, interaction.guild!, username);
    }

    if (customId === "raid_point_modal") {
      const username = interaction.fields.getTextInputValue("roblox_username").trim();
      const proof    = interaction.fields.getTextInputValue("proof_url").trim();
      if (!username) return interaction.reply({ content: "enter your roblox username.", ephemeral: true });
      if (!proof)    return interaction.reply({ content: "drop a screenshot url.", ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      return openRaidPointTicket(interaction, interaction.guild!, username, proof);
    }

    if (customId.startsWith("tag_ticket_modal::")) {
      const tag      = customId.slice("tag_ticket_modal::".length);
      const username = interaction.fields.getTextInputValue("roblox_username").trim();
      if (!username) return interaction.reply({ content: "enter your roblox username.", ephemeral: true });
      return postTagReviewEmbed(interaction, tag, username);
    }

    return;
  }

  // select menus
  if (interaction.isStringSelectMenu()) {
    const val = interaction.values[0] ?? "setup";

    if (customId === "ticket_select") {
      if (val === "verification") return showVerificationModal(interaction);
      if (val === "tag")          return openTagChannel(interaction);
      return;
    }

    if (customId === "in_channel_tag_select") return handleInChannelTagSelect(interaction);
    return;
  }

  // regular button clicks
  if (!interaction.isButton()) return;

  // help nav buttons — no permission needed
  if (customId.startsWith("help_cat:")) {
    const cat = customId.slice("help_cat:".length);
    return interaction.update(buildHelpMessage(cat) as Parameters<typeof interaction.update>[0]).catch(() => {});
  }

  // ticket panel buttons — anyone can click these to open a ticket
  if (customId === "open_ticket_verification") return showVerificationModal(interaction);
  if (customId === "open_ticket_tag")          return openTagChannel(interaction);

  // tag/raid review buttons — handled inside ticketHandler (has its own permission checks)
  if (customId === "ticket_tag_approve") return handleTagApprove(interaction);
  if (customId === "ticket_tag_deny")    return handleTagDeny(interaction);
  if (customId === "raid_point_request") return showRaidPointModal(interaction);
  if (customId === "raid_approve")       return handleRaidApprove(interaction);
  if (customId === "raid_deny")          return handleRaidDeny(interaction);

  // queue join button
  if (customId === "queue_join") {
    const gid = interaction.guild?.id;
    if (!gid) return interaction.reply({ content: "server only.", ephemeral: true });
    if (!isQueueActive(gid)) return interaction.reply({ content: "queue already ended.", ephemeral: true });

    const registered  = getRegistered();
    const robloxName  = registered[interaction.user.id];
    const displayName = robloxName ?? interaction.user.username;
    const result      = addJoiner(gid, interaction.user.id, displayName);

    if (result === "already_in") {
      return interaction.reply({ content: `you're already in as **${displayName}**`, ephemeral: true });
    }
    return interaction.reply({ content: `added to the queue as **${displayName}**`, ephemeral: true });
  }

  // resetall buttons are handled by a collector in the command, ignore here
  if (customId === "resetall_confirm" || customId === "resetall_cancel") return;

  // 1v1 challenge buttons
  if (customId.startsWith("1v1_accept::")) {
    return handleChallengeAccept(interaction, customId.slice("1v1_accept::".length));
  }
  if (customId.startsWith("1v1_decline::")) {
    return handleChallengeDecline(interaction, customId.slice("1v1_decline::".length));
  }

  // 1v1 log ticket result buttons
  if (customId.startsWith("1v1_log_win::")) {
    const [, submitter, challengeId] = customId.split("::");
    return handleLogWin(interaction, submitter ?? "", challengeId ?? "none");
  }
  if (customId.startsWith("1v1_log_loss::")) {
    const [, submitter, challengeId] = customId.split("::");
    return handleLogLoss(interaction, submitter ?? "", challengeId ?? "none");
  }
  if (customId === "1v1_log_close")   return handleLogClose(interaction);
  if (customId.startsWith("1v1_log_dispute::")) {
    return handleLogDispute(interaction, customId.slice("1v1_log_dispute::".length));
  }
  if (customId === "open_log_ticket") {
    if (!interaction.guild) return interaction.reply({ content: "server only.", ephemeral: true });
    return openLogTicket(interaction, interaction.guild);
  }

  
  const tickets = getTickets();
  const ticket  = tickets[interaction.channelId];
  const guild   = interaction.guild!;
  const guildId = guild.id;

  // fetch fresh member so roles are always accurate
  const member = await getFreshMember(interaction);

  if (customId === "ticket_close") {
    if (!ticket) return interaction.reply({ content: "no ticket found for this channel.", ephemeral: true });
    if (!member || !canClose(member, guildId)) {
      return interaction.reply({ content: "you don't have permission to close tickets.", ephemeral: true });
    }
    await interaction.deferReply();
    return closeTicket(interaction, ticket, null);
  }

  if (customId === "ticket_kick") {
    if (!ticket) return interaction.reply({ content: "no ticket found for this channel.", ephemeral: true });
    if (!member || !isVerificationStaff(member, guildId)) {
      return interaction.reply({ content: "you don't have permission to do that.", ephemeral: true });
    }
    const target = await guild.members.fetch(ticket.userId).catch(() => null);
    if (target) await target.kick("removed from ticket").catch(() => {});
    return interaction.reply({ content: `kicked <@${ticket.userId}>.` });
  }

  if (customId === "ticket_accept_group") {
    if (!ticket) return interaction.reply({ content: "no ticket found for this channel.", ephemeral: true });
    if (!member || !isVerificationStaff(member, guildId)) {
      return interaction.reply({ content: "you don't have permission to accept group requests.", ephemeral: true });
    }
    if (!ticket.robloxUsername) {
      return interaction.reply({ content: "no roblox username on this ticket.", ephemeral: true });
    }

    const robloxUser = await getUserByUsername(ticket.robloxUsername).catch(() => null);
    if (!robloxUser) {
      return interaction.reply({ content: `couldn't find **${ticket.robloxUsername}** on Roblox.`, ephemeral: true });
    }

    const settings = getGuild(guildId);
    const groupId  = settings.groupId ?? "703716156";
    const result   = await acceptJoinRequest(groupId, robloxUser.id);

    if (!result.ok) {
      return interaction.reply({ content: `failed: ${result.reason}`, ephemeral: true });
    }

    await interaction.reply({
      content: [
        `accepted into group`,
        `user: <@${ticket.userId}>`,
        `roblox: \`${ticket.robloxUsername}\``,
        `group: \`${groupId}\``,
        `by: <@${interaction.user.id}>`,
      ].join("\n"),
    });

    // log it
    const logCh = settings.logChannel
      ? guild.channels.cache.get(settings.logChannel) as TextChannel | undefined
      : undefined;
    if (logCh) {
      await logCh.send({
        content: [
          `group accept`,
          `user: <@${ticket.userId}>`,
          `roblox: \`${ticket.robloxUsername}\``,
          `group: \`${groupId}\``,
          `by: <@${interaction.user.id}> (${interaction.user.username})`,
        ].join("\n"),
      }).catch(() => {});
    }

    await logCommand(guildId,
      "Accept into Group",
      `<@${interaction.user.id}> accepted **${ticket.robloxUsername}** into group \`${groupId}\``,
      [
        { name: "Roblox", value: ticket.robloxUsername ?? "unknown", inline: true },
        { name: "Group",  value: groupId,                            inline: true },
      ],
    );
    return;
  }

  if (customId === "ticket_verify") {
    if (!ticket) return interaction.reply({ content: "no ticket found for this channel.", ephemeral: true });
    if (!member || !isVerificationStaff(member, guildId)) {
      return interaction.reply({ content: "you don't have permission to verify members.", ephemeral: true });
    }

    const settings = getGuild(guildId);
    if (!settings.verificationRole) {
      return interaction.reply({ content: "no verification role set — run `/vset @role` first.", ephemeral: true });
    }

    const target = await guild.members.fetch(ticket.userId).catch(() => null);
    if (!target) return interaction.reply({ content: "that user left the server.", ephemeral: true });

    // make sure they're actually in the required roblox group before verifying
    if (ticket.robloxUsername) {
      const groupId   = settings.groupId ?? "703716156";
      const rblxUser  = await getUserByUsername(ticket.robloxUsername).catch(() => null);
      if (rblxUser) {
        const inGroup = await isInGroup(rblxUser.id, groupId).catch(() => false);
        if (!inGroup) {
          return interaction.reply({
            content: `**${ticket.robloxUsername}** isn't in the group yet. they need to [join](https://www.roblox.com/communities/${groupId}) first.`,
            ephemeral: true,
          });
        }
      }
    }

    await target.roles.add(settings.verificationRole).catch(() => {});
    await target.roles.remove("1493486362165252177").catch(() => {});
    await target.roles.remove("1474907368662892758").catch(() => {});

    if (ticket.robloxUsername) setVerified(ticket.userId, ticket.robloxUsername);

    await interaction.reply({
      content: [
        `verified`,
        `user: <@${ticket.userId}>`,
        ticket.robloxUsername ? `roblox: \`${ticket.robloxUsername}\`` : null,
        `by: <@${interaction.user.id}>`,
      ].filter(Boolean).join("\n"),
    });

    // dm the user
    await target.user.send({
      content: `you've been verified in **${guild.name}**${ticket.robloxUsername ? ` as \`${ticket.robloxUsername}\`` : ""}. you should have access now.`,
    }).catch(() => {});

    return closeTicket(interaction, ticket, "user verified");
  }
}
