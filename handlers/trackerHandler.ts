import type { Client } from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  MessageFlags,
} from "discord.js";
import { getAllTracks, updateLastGame, getDmOnJoin, getNotifyChannelId } from "../utils/trackerStorage.js";
import { getUserPresence, getGameName, getUniverseDetails, getUserAvatarUrl } from "../utils/roblox.js";

const DARK_RED = 0x8B0000;

async function sendAlert(
  client: Client,
  discordUserId: string,
  notifyChannelId: string | null,
  dmEnabled: boolean,
  payload: { components: object[]; flags: number; content?: string },
): Promise<void> {
  if (notifyChannelId) {
    try {
      const channel = await client.channels.fetch(notifyChannelId).catch(() => null) as import("discord.js").TextChannel | null;
      if (channel?.isTextBased()) {
        await channel.send({ content: `<@${discordUserId}>`, ...payload } as never);
        return;
      }
    } catch {
      // channel failed — fall through to DM
    }
  }

  if (dmEnabled) {
    try {
      const user = await client.users.fetch(discordUserId);
      await user.send(payload as never);
    } catch {
      // DM failed silently (user has DMs off etc.)
    }
  }
}

export async function runTrackerCycle(client: Client): Promise<void> {
  try {
    const tracks = getAllTracks();
    if (tracks.length === 0) return;

    const grouped = new Map<number, typeof tracks>();
    for (const t of tracks) {
      const list = grouped.get(t.robloxUserId) ?? [];
      list.push(t);
      grouped.set(t.robloxUserId, list);
    }

    for (const [robloxUserId, entries] of grouped) {
      try {
        const presence = await getUserPresence(robloxUserId);
        if (!presence) continue;

        const currentPlaceId = presence.placeId ?? null;
        const currentUniverseId = presence.universeId ?? null;
        const isInGame = presence.userPresenceType === 2;

        const rawGameId = presence.gameId ?? null;
        const sessionKey = rawGameId ?? (currentPlaceId ? `p:${currentPlaceId}` : null);

        for (const entry of entries) {
          const wasInGame = entry.lastGameId !== null;

          let sessionChanged = false;
          if (wasInGame) {
            const prevIsPlaceFallback = entry.lastGameId!.startsWith("p:");
            const currIsPlaceFallback = rawGameId === null;

            if (!prevIsPlaceFallback && !currIsPlaceFallback) {
              sessionChanged = entry.lastGameId !== rawGameId;
            } else if (prevIsPlaceFallback && currIsPlaceFallback) {
              sessionChanged = entry.lastGameId !== sessionKey;
            } else {
              sessionChanged = entry.lastPlaceId !== currentPlaceId;
            }
          }

          if (isInGame && (!wasInGame || sessionChanged)) {
            updateLastGame(entry.discordUserId, robloxUserId, sessionKey, currentPlaceId ?? null);

            const notifyChannelId = getNotifyChannelId(entry.discordUserId);
            const dmEnabled = getDmOnJoin(entry.discordUserId);

            if (!dmEnabled && !notifyChannelId) continue;

            let gameName = "Unknown Game";
            if (currentUniverseId) {
              const details = await getUniverseDetails(currentUniverseId);
              gameName = details?.name ?? gameName;
            } else if (currentPlaceId) {
              gameName = await getGameName(currentPlaceId);
            }

            if (entry.alertGame) {
              if (!gameName.toLowerCase().includes(entry.alertGame.toLowerCase())) continue;
            }

            const avatarUrl = await getUserAvatarUrl(robloxUserId);

            const hasSpecificServer = rawGameId !== null && currentPlaceId !== null;
            const joinUrl = hasSpecificServer
              ? `https://www.roblox.com/games/start?placeId=${currentPlaceId}&gameInstanceId=${rawGameId}`
              : currentPlaceId
                ? `https://www.roblox.com/games/${currentPlaceId}`
                : null;

            const bodyLines = [
              `**${entry.robloxUsername}** hopped in a game`,
              `**game**  ·  \`${gameName}\``,
              ...(entry.alertGame ? [`**filter**  ·  \`${entry.alertGame}\``] : []),
            ];

            const c = new ContainerBuilder().setAccentColor(DARK_RED);

            if (avatarUrl) {
              const section = new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines.join("\n")))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
              c.addSectionComponents(section);
            } else {
              c.addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines.join("\n")));
            }

            c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
            c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ◈  /curek tracker`));

            const components: object[] = [c];

            if (joinUrl) {
              components.push(
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setLabel(hasSpecificServer ? "join server" : "open game")
                    .setStyle(ButtonStyle.Link)
                    .setURL(joinUrl),
                ),
              );
            }

            await sendAlert(client, entry.discordUserId, notifyChannelId, dmEnabled, {
              components,
              flags: MessageFlags.IsComponentsV2,
            });

          } else if (!isInGame && wasInGame) {
            updateLastGame(entry.discordUserId, robloxUserId, null, null);
          }
        }
      } catch {
        // skip individual user errors
      }
    }
  } catch (err) {
    console.error("[Tracker] Cycle error:", err);
  }
}
