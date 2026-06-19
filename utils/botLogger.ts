import type { Client, TextChannel } from "discord.js";
import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } from "discord.js";
import { getGuild } from "./storage.js";

let _client: Client | null = null;

export function initLogger(client: Client): void {
  _client = client;
}

export type LogLevel = "info" | "warn" | "error" | "command" | "ticket" | "points" | "setup";

export interface BotLogField {
  name: string;
  value: string;
  inline?: boolean;
}

const LEVEL_COLOR: Record<LogLevel, number> = {
  info:    0x6366f1,
  warn:    0xf59e0b,
  error:   0xef4444,
  command: 0x3b82f6,
  ticket:  0x8b5cf6,
  points:  0x10b981,
  setup:   0x64748b,
};

export async function botLog(
  guildId: string,
  level: LogLevel,
  title: string,
  description: string,
  fields?: BotLogField[],
): Promise<void> {
  if (!_client) return;
  try {
    const settings = getGuild(guildId);
    if (!settings.botLogChannel) return;

    const guild = _client.guilds.cache.get(guildId);
    if (!guild) return;

    const ch = guild.channels.cache.get(settings.botLogChannel) as TextChannel | undefined;
    if (!ch) return;

    const color = LEVEL_COLOR[level] ?? 0x6366f1;
    const c = new ContainerBuilder().setAccentColor(color);

    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${title}**`));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(description));

    if (fields && fields.length > 0) {
      c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
      const fieldLines = fields.map((f) => `**${f.name}**  ·  ${f.value}`).join("\n");
      c.addTextDisplayComponents(new TextDisplayBuilder().setContent(fieldLines));
    }

    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ◈  /curek  ·  ${level}`));

    await ch.send({ components: [c], flags: MessageFlags.IsComponentsV2 });
  } catch {
    // dont let logging crash anything
  }
}

export const logInfo    = (g: string, t: string, d: string, f?: BotLogField[]) => botLog(g, "info",    t, d, f);
export const logWarn    = (g: string, t: string, d: string, f?: BotLogField[]) => botLog(g, "warn",    t, d, f);
export const logError   = (g: string, t: string, d: string, f?: BotLogField[]) => botLog(g, "error",   t, d, f);
export const logCommand = (g: string, t: string, d: string, f?: BotLogField[]) => botLog(g, "command", t, d, f);
export const logTicket  = (g: string, t: string, d: string, f?: BotLogField[]) => botLog(g, "ticket",  t, d, f);
export const logPoints  = (g: string, t: string, d: string, f?: BotLogField[]) => botLog(g, "points",  t, d, f);
export const logSetup   = (g: string, t: string, d: string, f?: BotLogField[]) => botLog(g, "setup",   t, d, f);
