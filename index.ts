import { Client, GatewayIntentBits, Partials } from "discord.js";
import { registerReady } from "./events/ready.js";
import { registerInteractionCreate } from "./events/interactionCreate.js";
import { registerMessageCreate } from "./events/messageCreate.js";
import { registerPresenceUpdate } from "./events/presenceUpdate.js";
import { initLogger } from "./utils/botLogger.js";
import { runTrackerCycle } from "./handlers/trackerHandler.js";

const TRACKER_INTERVAL_MS = 30_000;

export async function startBot() {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    console.warn("no token found, not starting");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  client.once("clientReady", () => {
    initLogger(client);
    // Start tracker polling cycle
    setTimeout(() => runTrackerCycle(client), 5_000);
    setInterval(() => runTrackerCycle(client), TRACKER_INTERVAL_MS);
  });

  registerReady(client);
  registerInteractionCreate(client);
  registerMessageCreate(client);
  registerPresenceUpdate(client);

  await client.login(token);
}

startBot().catch(console.error);
