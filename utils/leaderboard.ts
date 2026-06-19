import type { Client } from "discord.js";
import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } from "discord.js";
import { readJSON, getGuild } from "./storage.js";

export function buildLeaderboardEmbed(
  guildPts: Record<string, number>,
  _guildName: string,
): { components: object[]; flags: number } | null {
  const sorted = Object.entries(guildPts)
    .filter(([, pts]) => pts > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15);

  if (sorted.length === 0) return null;

  const MEDALS = ["🥇", "🥈", "🥉"];
  const list = sorted
    .map(([id, pts], i) => {
      const medal = MEDALS[i] ?? `\`${i + 1}.\``;
      return `${medal}  <@${id}>  ·  **${pts}** pt${pts !== 1 ? "s" : ""}`;
    })
    .join("\n");

  const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const c = new ContainerBuilder().setAccentColor(0x6366f1);
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**◈  Points Leaderboard**`));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(list));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# updated ${now}`));

  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

export async function refreshLeaderboard(client: Client, guildId: string): Promise<void> {
  try {
    const settings = getGuild(guildId);
    const lbMsg    = settings.leaderboardMessage;
    if (!lbMsg) return;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(lbMsg.channelId);
    if (!channel || !("messages" in channel)) return;

    const msg = await (channel as import("discord.js").TextChannel).messages
      .fetch(lbMsg.messageId)
      .catch(() => null);
    if (!msg) return;

    const data     = readJSON<Record<string, Record<string, number>>>("points.json");
    const guildPts = data[guildId] ?? {};
    const payload  = buildLeaderboardEmbed(guildPts, guild.name);
    if (!payload) return;

    await msg.edit(payload as Parameters<typeof msg.edit>[0]);
  } catch {
    // probably got deleted or something, ignore it
  }
}
