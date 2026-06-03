import type { Client, GuildMember } from "discord.js";
import { EmbedBuilder, ActivityType, type TextChannel } from "discord.js";
import {
  isVanityWatcherEnabled,
  getVanityLogChannel,
  getOppVanities,
  getWhitelistedVanities,
  getSilentVanities,
  getVanityPingRole,
  flagMember,
  isMemberFlagged,
} from "../utils/vanityStorage.js";

// Extract all /word patterns from a custom status string
function extractVanities(status: string): string[] {
  const matches = status.match(/\/[a-zA-Z0-9_]+/g) ?? [];
  return matches.map(m => m.slice(1).toLowerCase());
}

function getCustomStatus(member: GuildMember): string | null {
  const activity = member.presence?.activities.find(a => a.type === ActivityType.Custom);
  return activity?.state ?? null;
}

export async function checkMemberVanity(client: Client, member: GuildMember): Promise<void> {
  if (member.user.bot) return;
  const guildId = member.guild.id;
  if (!isVanityWatcherEnabled(guildId)) return;

  const logChannelId = getVanityLogChannel(guildId);
  if (!logChannelId) return;

  const status = getCustomStatus(member);
  if (!status) return;

  const oppVanities = getOppVanities(guildId);
  if (oppVanities.length === 0) return;

  const whitelisted = getWhitelistedVanities(guildId);
  const silentVanities = getSilentVanities(guildId);
  const pingRoleId = getVanityPingRole(guildId);
  const statusVanities = extractVanities(status);

  for (const vanity of statusVanities) {
    if (whitelisted.includes(vanity)) continue;
    if (!oppVanities.includes(vanity)) continue;
    if (isMemberFlagged(guildId, member.id)) return;

    flagMember(guildId, member.id, vanity);

    try {
      const channel = await client.channels.fetch(logChannelId).catch(() => null) as TextChannel | null;
      if (!channel?.isTextBased()) return;

      const SEP = "───────────────────────────────";
      const embed = new EmbedBuilder()
        .setColor(0x6366f1)
        .setAuthor({
          name: `${member.user.username}  ·  vanity detected`,
          iconURL: member.user.displayAvatarURL(),
        })
        .setDescription(
          `${SEP}\n` +
          `  repping   **/${vanity}**\n` +
          `  status    \`${status}\`\n` +
          `  id        \`${member.id}\`\n` +
          `${SEP}`
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setFooter({ text: "◈  vanity system" })
        .setTimestamp();

      // Determine ping content:
      // - silent vanity → no ping, just post the embed
      // - ping role configured → ping that role
      // - no role configured → @everyone
      const isSilent = silentVanities.includes(vanity);
      const pingContent = isSilent
        ? undefined
        : pingRoleId
          ? `<@&${pingRoleId}>`
          : "@everyone";

      if (pingContent) {
        await channel.send({ content: pingContent, embeds: [embed] }).catch(() =>
          channel.send({ embeds: [embed] })
        );
      } else {
        await channel.send({ embeds: [embed] }).catch(() => {});
      }
    } catch {
      // Channel inaccessible — silently skip
    }

    return;
  }
}

export async function scanAllMembers(client: Client, guildId: string): Promise<number> {
  let count = 0;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return 0;
  if (!isVanityWatcherEnabled(guildId)) return 0;

  try {
    await guild.members.fetch();
  } catch {
    return 0;
  }

  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;
    const before = isMemberFlagged(guildId, member.id);
    await checkMemberVanity(client, member);
    if (!before && isMemberFlagged(guildId, member.id)) count++;
  }

  return count;
}
