import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

const SEP = "───────────────────────────────";
const DARK_RED = 0x8B0000;

interface CommandEntry {
  name: string;
  desc: string;
}

export const CATEGORIES: Record<string, { label: string; description: string; commands: CommandEntry[] }> = {
  setup: {
    label: "Setup",
    description: "Server configuration",
    commands: [
      { name: "/setupticket #channel [type]",    desc: "Sends the ticket panel to a channel. Type can be verification, tag, or both (default: both)." },
      { name: "/logset #channel",                desc: "Sets the channel where ticket close logs are posted." },
      { name: "/taglogset #channel",             desc: "Sets the channel where tag approval logs are posted." },
      { name: "/botlogset #channel",             desc: "Sets the channel where all bot activity is logged." },
      { name: "/gid <groupId>",                  desc: "Sets the Roblox group ID used for verification checks." },
      { name: "/vset @role",                     desc: "Sets the role assigned to members when they get verified." },
      { name: "/vmr add @role",                  desc: "Adds a role to the verification manager list. They can verify, kick, and close tickets." },
      { name: "/vmr remove @role",               desc: "Removes a role from the verification manager list." },
      { name: "/vmr list",                       desc: "Shows all current verification manager roles." },
      { name: "/prefix <new>",                   desc: "Changes the command prefix for this server." },
    ],
  },
  groups: {
    label: "Groups",
    description: "Group checks and verification",
    commands: [
      { name: "/gc <username>",                  desc: "Runs a full group check on a Roblox user. Shows all groups, flags, and main group membership." },
      { name: "/flag <groupId>",                 desc: "Flags a Roblox group. Members in flagged groups will be marked in verification tickets." },
      { name: "/unflag <groupId>",               desc: "Removes a group from this server's flagged list." },
      { name: "/flist",                          desc: "Lists all flagged groups, both global and server-specific." },
      { name: "/verify @user [username]",        desc: "Manually gives a member the verified role. Optionally links their Roblox username." },
      { name: "/unverify @user",                 desc: "Removes the verified role from a member." },
    ],
  },
  tags: {
    label: "Tags",
    description: "Tag assignment and management",
    commands: [
      { name: "/role <roblox> <tag>",            desc: "Assigns a Roblox tag to a user. Use the tag name set via /sr." },
      { name: "/sr <name>",                      desc: "Adds a custom tag option that can be used with /role." },
      { name: "/tmr @role",                      desc: "Sets the tag manager role. Members with this role can approve and deny tag requests." },
      { name: "/wlrole @role [command]",         desc: "Gives a role access to a specific command. Leave command blank for tag manager access." },
    ],
  },
  points: {
    label: "Points",
    description: "Raid points system",
    commands: [
      { name: "/register <username>",            desc: "Links your Discord account to your Roblox username. Required before submitting raid point requests." },
      { name: "/rankup @user [amount]",          desc: "Adds raid points to a member. Optionally specify an amount (default: 1)." },
      { name: "/removepoints @user [amount]",    desc: "Removes raid points from a member. Optionally specify an amount (default: 1)." },
      { name: "/check [@user]",                  desc: "Shows your or another member's current raid point total." },
      { name: "/leaderboard",                    desc: "Shows the top 15 raid point holders in the server." },
      { name: "/resetall",                       desc: "Wipes all raid points in the server. Prompts for confirmation before proceeding." },
      { name: "/raidpointspanel #channel",       desc: "Sends the raid point request panel to a channel." },
      { name: "/leaderboardpanel #channel",      desc: "Sends a live leaderboard panel that auto-refreshes every 10 minutes." },
      { name: "/wlp @role",                      desc: "Gives a role full access to all raid point commands." },
      { name: "/psr @role",                      desc: "Sets the points support role. They can review requests and use check, leaderboard, and rankup." },
    ],
  },
  ranks: {
    label: "Ranks",
    description: "Rank role configuration",
    commands: [
      { name: "/addrank <roleId> <points> [name]", desc: "Adds a rank tier. Members are automatically promoted when their points reach the threshold. Max 30 ranks." },
      { name: "/removerank <roleId>",              desc: "Removes a rank tier from the configuration." },
      { name: "/ranks",                            desc: "Lists all configured rank tiers sorted by points required." },
    ],
  },
  tracker: {
    label: "Tracker",
    description: "Roblox player tracking",
    commands: [
      { name: "/track add <username>",           desc: "Adds a Roblox user to your tracking list. You will be pinged when they join a game." },
      { name: "/track remove <username>",        desc: "Removes a Roblox user from your tracking list." },
      { name: "/track list",                     desc: "Shows all Roblox users you are currently tracking." },
      { name: "/track check <username>",         desc: "Checks a tracked user's current activity status." },
      { name: "/track alert <username> [game]",  desc: "Only get notified when a tracked user joins a specific game. Leave game blank to get all alerts." },
      { name: "/track settings [dm_on_join]",    desc: "Shows your current tracker settings. Optionally toggle DM alerts on or off." },
      { name: "/track notify [#channel]",        desc: "Sets where tracker alerts are sent. Leave channel blank to switch back to DMs." },
    ],
  },
  vanity: {
    label: "Vanity",
    description: "Discord vanity URL monitoring",
    commands: [
      { name: "/vanity toggle",                  desc: "Turns the vanity watcher on or off for this server." },
      { name: "/vanity setlog #channel",         desc: "Sets the channel where vanity alerts are posted." },
      { name: "/vanity flag <vanity>",           desc: "Marks a Discord vanity as an opp vanity. Members repping it will be flagged." },
      { name: "/vanity unflagvanity <vanity>",   desc: "Removes a vanity from the opp list." },
      { name: "/vanity whitelist <vanity>",      desc: "Whitelists a vanity. Members repping it will not be flagged." },
      { name: "/vanity unwhitelist <vanity>",    desc: "Removes a vanity from the whitelist." },
      { name: "/vanity opplist",                 desc: "Lists all vanities currently marked as opp." },
      { name: "/vanity vanities",                desc: "Lists all whitelisted vanities." },
      { name: "/vanity flagged",                 desc: "Lists all members currently repping an opp vanity." },
      { name: "/vanity unflag @user",            desc: "Manually removes the flag from a member." },
      { name: "/vanity scan",                    desc: "Scans all members for opp vanities right now." },
    ],
  },
  blacklist: {
    label: "Blacklist",
    description: "Roblox username blacklist",
    commands: [
      { name: "/blacklist add <username> [reason]", desc: "Adds a Roblox username to the blacklist. Blacklisted users are flagged when they open a ticket." },
      { name: "/blacklist remove <username>",        desc: "Removes a Roblox username from the blacklist." },
      { name: "/blacklist check <username>",         desc: "Checks if a Roblox username is on the blacklist." },
      { name: "/blacklist list",                     desc: "Lists all blacklisted usernames along with their reason and who added them." },
    ],
  },
  whitelist: {
    label: "Whitelist",
    description: "Access control and permissions",
    commands: [
      { name: "/wl bot @user",                   desc: "Grants a user full access to every bot command and button." },
      { name: "/wl command <name> @user",        desc: "Grants a user access to one specific command." },
      { name: "/whitelisted",                    desc: "Shows all users and roles that have been whitelisted." },
    ],
  },
  bot: {
    label: "Bot",
    description: "Bot customization",
    commands: [
      { name: "/setavatar [url or attachment]",  desc: "Changes the bot's profile picture. Attach an image or paste a URL." },
      { name: "/setbanner [url or attachment]",  desc: "Changes the bot's banner. Requires Nitro on the bot account." },
      { name: "/setusername <name>",             desc: "Changes the bot's global username. Discord rate-limits this so use it sparingly." },
      { name: "/setnickname [name]",             desc: "Changes the bot's nickname in this server. Leave blank to reset." },
      { name: "/setstatus <text>",               desc: "Sets the bot's playing status. Use clear to remove it." },
      { name: "/setpresence <status>",           desc: "Sets presence to online, idle, dnd, or invisible." },
    ],
  },
};

const DEFAULT_CATEGORY = "setup";
const CATEGORY_KEYS = Object.keys(CATEGORIES);

function buildCategoryButtons(selected: string): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const chunkSize = 5;

  for (let i = 0; i < CATEGORY_KEYS.length; i += chunkSize) {
    const chunk = CATEGORY_KEYS.slice(i, i + chunkSize);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      chunk.map((key) => {
        const cat = CATEGORIES[key]!;
        return new ButtonBuilder()
          .setCustomId(`help_cat:${key}`)
          .setLabel(cat.label)
          .setStyle(key === selected ? ButtonStyle.Danger : ButtonStyle.Secondary);
      }),
    );
    rows.push(row);
  }

  return rows;
}

export function buildHelpMessage(category: string = DEFAULT_CATEGORY): { embeds: object[]; components: unknown[] } {
  const cat = CATEGORIES[category] ?? CATEGORIES[DEFAULT_CATEGORY]!;
  const commandLines = cat.commands
    .map((c) => `\`${c.name}\`\n${c.desc}`)
    .join("\n\n");
  return {
    embeds: [{
      color: DARK_RED,
      description: `${SEP}\n**${cat.label}**  —  ${cat.description}\n${SEP}\n\n${commandLines}\n\n${SEP}`,
      footer: { text: "/curek" },
      timestamp: new Date().toISOString(),
    }],
    components: buildCategoryButtons(category),
  };
}

export const ALL_COMMANDS = Object.values(CATEGORIES).flatMap((c) => c.commands);
export const PER_PAGE = 6;
export function buildPage(_page: number) { return buildHelpMessage(DEFAULT_CATEGORY); }
