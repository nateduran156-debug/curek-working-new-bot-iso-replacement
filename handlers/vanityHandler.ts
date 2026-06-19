import type { Client, GuildMember } from "discord.js";
import {
  ActivityType,
  type TextChannel,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  MessageFlags,
} from "discord.js";
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

      const avatarUrl = member.user.displayAvatarURL({ size: 256 });

      const c = new ContainerBuilder().setAccentColor(0x6366f1);

      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**${member.user.username}**  ·  vanity detected\n\n**repping**  ·  \`/${vanity}\`\n**status**  ·  \`${status}\`\n**id**  ·  \`${member.id}\``,
          ),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(avatarUrl),
        );

      c.addSectionComponents(section);
      c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
      c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ◈  vanity system`));

      const isSilent = silentVanities.includes(vanity);
      const pingContent = isSilent
        ? undefined
        : pingRoleId
          ? `<@&${pingRoleId}>`
          : "@everyone";

      if (pingContent) {
        await channel.send({
          content: pingContent,
          components: [c],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => channel.send({ components: [c], flags: MessageFlags.IsComponentsV2 }));
      } else {
        await channel.send({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
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
