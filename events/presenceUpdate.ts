import type { Client, GuildMember } from "discord.js";
import { checkMemberVanity } from "../handlers/vanityHandler.js";

export function registerPresenceUpdate(client: Client) {
  client.on("presenceUpdate", async (oldPresence, newPresence) => {
    try {
      const member = newPresence.member as GuildMember | null;
      if (!member) return;
      await checkMemberVanity(client, member);
    } catch {
      // Silently skip errors
    }
  });
}
