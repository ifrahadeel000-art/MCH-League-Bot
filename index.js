const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  REST,
  Routes,
} = require("discord.js");
const fs = require("fs");

const DB_PATH = "./database.json";
const LEAGUE_CHANNEL_ID = "1509081893956620458";
const LEAGUE_HOST_ROLE_ID = "1458681148845850687";
const LEAGUES_PING_ROLE_ID = "1515427023458402424";
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// ── Database ──────────────────────────────────────────────────────────────────

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ leagues: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateLeagueId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let id = "";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function getTotalSpots(format) {
  return { "2v2": 4, "3v3": 6, "4v4": 8 }[format];
}

function buildTeams(players, format) {
  // Shuffle players randomly
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const teamSize = parseInt(format[0]); // "2v2" → 2, "3v3" → 3, "4v4" → 4
  const team1 = shuffled.slice(0, teamSize);
  const team2 = shuffled.slice(teamSize);
  return { team1, team2 };
}

function buildTeamEmbed(league) {
  const { team1, team2 } = buildTeams(league.players, league.format);
  return new EmbedBuilder()
    .setTitle(`Teams — League ${league.id}`)
    .addFields(
      { name: "Team 1", value: team1.map((id) => `<@${id}>`).join("\n"), inline: true },
      { name: "Team 2", value: team2.map((id) => `<@${id}>`).join("\n"), inline: true }
    )
    .addFields(
      { name: "Format",     value: league.format,    inline: true },
      { name: "Match Type", value: league.matchType, inline: true },
      { name: "Perks",      value: league.perks,     inline: true },
      { name: "Region",     value: league.region,    inline: true }
    )
    .setColor(0x57f287)
    .setFooter({ text: "Teams were randomly assigned" });
}

function rerollRow(leagueId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`reroll_${leagueId}`)
      .setLabel("Reroll Teams")
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildLeagueEmbed(league) {
  const spotsLeft = league.totalSpots - league.players.length;
  const playerMentions = league.players.map((id) => `<@${id}>`).join("\n") || "None";
  return new EmbedBuilder()
    .setTitle("League Available")
    .addFields(
      { name: "Format",     value: league.format,                       inline: true },
      { name: "Match Type", value: league.matchType,                    inline: true },
      { name: "Perks",      value: league.perks,                        inline: true },
      { name: "Region",     value: league.region,                       inline: true },
      { name: "Host",       value: `<@${league.hostId}>`,               inline: true },
      { name: "Spots Left", value: `${spotsLeft} / ${league.totalSpots}`, inline: true },
      { name: "Players",    value: playerMentions },
      { name: "League ID",  value: league.id }
    )
    .setFooter({ text: `Cancel: /league cancel id:${league.id}` })
    .setColor(0x5865f2);
}

function joinRow(leagueId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`join_${leagueId}`)
      .setLabel("Join League")
      .setStyle(ButtonStyle.Primary)
  );
}

// ── Command registration ──────────────────────────────────────────────────────

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("league")
      .setDescription("League commands")
      .addSubcommand((s) =>
        s.setName("host").setDescription("Host a league")
          .addStringOption((o) =>
            o.setName("format").setDescription("Match format").setRequired(true)
              .addChoices(
                { name: "2v2", value: "2v2" },
                { name: "3v3", value: "3v3" },
                { name: "4v4", value: "4v4" }
              )
          )
          .addStringOption((o) =>
            o.setName("match_type").setDescription("Match type").setRequired(true)
              .addChoices(
                { name: "Swift Game", value: "Swift Game" },
                { name: "War Game",   value: "War Game"   }
              )
          )
          .addStringOption((o) =>
            o.setName("perks").setDescription("Perks setting").setRequired(true)
              .addChoices(
                { name: "Perks",    value: "Perks"    },
                { name: "No Perks", value: "No Perks" }
              )
          )
          .addStringOption((o) =>
            o.setName("region").setDescription("Region").setRequired(true)
              .addChoices(
                { name: "Europe",        value: "Europe"        },
                { name: "Asia",          value: "Asia"          },
                { name: "North America", value: "North America" },
                { name: "South America", value: "South America" },
                { name: "Ocean",         value: "Ocean"         }
              )
          )
      )
      .addSubcommand((s) =>
        s.setName("cancel").setDescription("Cancel a league")
          .addStringOption((o) =>
            o.setName("id").setDescription("League ID to cancel").setRequired(true)
          )
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("autoteam")
      .setDescription("Randomly assign teams for the league (host only, use inside the league thread)")
      .toJSON(),
  ];

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log(`Commands registered to guild ${GUILD_ID}`);
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log("Commands registered globally");
    }
  } catch (err) {
    console.error("Command registration failed:", err);
  }
}

// ── Bot ───────────────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("clientReady", async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  await registerCommands();
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "league") {
      await handleLeagueCommand(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === "autoteam") {
      await handleAutoTeam(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith("join_")) {
      await handleJoinButton(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith("reroll_")) {
      await handleReroll(interaction);
    }
  } catch (err) {
    console.error("Interaction error:", err);
    // Try to reply with error if interaction not yet acknowledged
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "An error occurred. Please try again.",
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (_) {}
  }
});

// ── /league host & cancel ─────────────────────────────────────────────────────

async function handleLeagueCommand(interaction) {
  const sub = interaction.options.getSubcommand();

  // ── HOST ──────────────────────────────────────────────────────────────────
  if (sub === "host") {
    if (interaction.channelId !== LEAGUE_CHANNEL_ID) {
      return interaction.reply({
        content: `Leagues can only be hosted in <#${LEAGUE_CHANNEL_ID}>.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!interaction.member.roles.cache.has(LEAGUE_HOST_ROLE_ID)) {
      return interaction.reply({
        content: "You do not have the League Host role required to host leagues.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const format    = interaction.options.getString("format");
    const matchType = interaction.options.getString("match_type");
    const perks     = interaction.options.getString("perks");
    const region    = interaction.options.getString("region");
    const db        = loadDB();

    // A league counts as active only if it was fully created (has a messageId)
    const existing = Object.values(db.leagues).find(
      (l) => l.hostId === interaction.user.id && l.active && l.messageId
    );
    if (existing) {
      return interaction.reply({
        content: `You already have an active league (ID: **${existing.id}**). Cancel it first.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Auto-clean any ghost leagues for this user (created but never finished)
    for (const [id, l] of Object.entries(db.leagues)) {
      if (l.hostId === interaction.user.id && l.active && !l.messageId) {
        db.leagues[id].active = false;
      }
    }
    saveDB(db);

    let leagueId;
    do { leagueId = generateLeagueId(); } while (db.leagues[leagueId]);

    const totalSpots = getTotalSpots(format);
    const league = {
      id: leagueId,
      hostId: interaction.user.id,
      format,
      matchType,
      perks,
      region,
      players: [interaction.user.id],
      totalSpots,
      messageId: null,
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      threadId: null,
      active: true,
      createdAt: Date.now(),
    };

    db.leagues[leagueId] = league;
    saveDB(db);

    // Acknowledge the slash command
    await interaction.reply({
      content: `League **${leagueId}** has been created.`,
      flags: MessageFlags.Ephemeral,
    });

    // Post the public embed with join button
    const msg = await interaction.channel.send({
      embeds: [buildLeagueEmbed(league)],
      components: [joinRow(leagueId)],
    });

    db.leagues[leagueId].messageId = msg.id;
    saveDB(db);

    // Ping @leagues role — no extra text, role ping only
    await interaction.channel.send(`<@&${LEAGUES_PING_ROLE_ID}>`);

    // Open private thread immediately — only joined players will be added
    try {
      const thread = await interaction.channel.threads.create({
        name: `League ${leagueId} — ${format} ${matchType}`,
        autoArchiveDuration: 1440,
        type: ChannelType.PrivateThread,
        invitable: false,
        reason: `Private thread for league ${leagueId}`,
      });

      // Add host as first member
      await thread.members.add(interaction.user.id);

      await thread.send(
        [
          `**League ${leagueId} — ${format} ${matchType}**`,
          ``,
          `Format: **${format}** | Match Type: **${matchType}** | Perks: **${perks}** | Region: **${region}**`,
          ``,
          `Waiting for players to join. Spots: 1 / ${totalSpots}`,
          ``,
          `Host: <@${interaction.user.id}>`,
        ].join("\n")
      );

      db.leagues[leagueId].threadId = thread.id;
      saveDB(db);

      console.log(`Private thread created for league ${leagueId}: ${thread.id}`);
    } catch (err) {
      console.error("Failed to create private thread:", err);
    }
  }

  // ── CANCEL ────────────────────────────────────────────────────────────────
  if (sub === "cancel") {
    if (!interaction.member.roles.cache.has(LEAGUE_HOST_ROLE_ID)) {
      return interaction.reply({
        content: "You do not have the League Host role required to cancel leagues.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const leagueId = interaction.options.getString("id").trim().toUpperCase();
    const db = loadDB();
    const league = db.leagues[leagueId];

    if (!league || !league.active) {
      return interaction.reply({
        content: `No active league found with ID: **${leagueId}**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (
      league.hostId !== interaction.user.id &&
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return interaction.reply({
        content: "You can only cancel leagues that you hosted.",
        flags: MessageFlags.Ephemeral,
      });
    }

    db.leagues[leagueId].active = false;
    saveDB(db);

    await interaction.reply({
      content: `League **${leagueId}** has been cancelled.`,
      flags: MessageFlags.Ephemeral,
    });

    // Edit original embed in-place — same fields, title changed, button disabled
    try {
      const channel = await client.channels.fetch(league.channelId);
      const msg = await channel.messages.fetch(league.messageId);
      const spotsLeft = league.totalSpots - league.players.length;
      const playerMentions = league.players.map((id) => `<@${id}>`).join("\n") || "None";
      const cancelledEmbed = new EmbedBuilder()
        .setTitle("League Cancelled")
        .addFields(
          { name: "Format",     value: league.format,                         inline: true },
          { name: "Match Type", value: league.matchType,                      inline: true },
          { name: "Perks",      value: league.perks,                          inline: true },
          { name: "Region",     value: league.region,                         inline: true },
          { name: "Host",       value: `<@${league.hostId}>`,                 inline: true },
          { name: "Spots Left", value: `${spotsLeft} / ${league.totalSpots}`, inline: true },
          { name: "Players",    value: playerMentions },
          { name: "League ID",  value: league.id }
        )
        .setFooter({ text: `Cancelled by: ${interaction.user.username}` })
        .setColor(0xed4245);

      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`cancelled_${leagueId}`)
          .setLabel("League Cancelled")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      );

      await msg.edit({ embeds: [cancelledEmbed], components: [disabledRow] });
    } catch (e) {
      console.error("Error editing cancelled league message:", e);
    }

    // Delete the private thread
    if (league.threadId) {
      try {
        const thread = await client.channels.fetch(league.threadId);
        await thread.delete(`League ${leagueId} cancelled`);
      } catch (e) {
        console.error("Error deleting thread:", e);
      }
    }
  }
}

// ── Join button ───────────────────────────────────────────────────────────────

async function handleJoinButton(interaction) {
  const leagueId = interaction.customId.replace("join_", "");
  console.log(`[JOIN] User ${interaction.user.id} (${interaction.user.username}) attempting to join league ${leagueId}`);
  const db = loadDB();
  const league = db.leagues[leagueId];

  if (!league || !league.active) {
    return interaction.reply({
      content: "This league is no longer available.",
      flags: MessageFlags.Ephemeral,
    });
  }

  if (league.players.includes(interaction.user.id)) {
    return interaction.reply({
      content: "You have already joined this league.",
      flags: MessageFlags.Ephemeral,
    });
  }

  if (league.players.length >= league.totalSpots) {
    return interaction.reply({
      content: "This league is full.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Add player
  db.leagues[leagueId].players.push(interaction.user.id);
  saveDB(db);

  const updated  = db.leagues[leagueId];
  const spotsLeft = updated.totalSpots - updated.players.length;

  // Update embed
  await interaction.update({
    embeds: [buildLeagueEmbed(updated)],
    components: spotsLeft > 0 ? [joinRow(leagueId)] : [],
  });

  // Add player to the existing private thread
  if (updated.threadId) {
    try {
      const thread = await client.channels.fetch(updated.threadId);
      await thread.members.add(interaction.user.id);

      const playerList = updated.players.map((id) => `<@${id}>`).join(", ");
      const filledNote = spotsLeft === 0 ? " — All spots filled. Use `/autoteam` to assign teams." : "";
      await thread.send(
        `<@${interaction.user.id}> has joined. Spots: ${updated.players.length} / ${updated.totalSpots}${filledNote}\n\nPlayers: ${playerList}`
      );
    } catch (err) {
      console.error("Failed to add player to thread:", err);
    }
  }
}

// ── /autoteam ─────────────────────────────────────────────────────────────────

async function handleAutoTeam(interaction) {
  // Must be used inside a thread
  if (!interaction.channel.isThread()) {
    return interaction.reply({
      content: "This command can only be used inside a league thread.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const db = loadDB();

  // Find the league that owns this thread
  const league = Object.values(db.leagues).find(
    (l) => l.threadId === interaction.channelId && l.active
  );

  if (!league) {
    return interaction.reply({
      content: "No active league is linked to this thread.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Only the host can run this
  if (league.hostId !== interaction.user.id) {
    return interaction.reply({
      content: "Only the league host can assign teams.",
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({
    content: "**Teams have been randomly assigned:**",
    embeds: [buildTeamEmbed(league)],
    components: [rerollRow(league.id)],
  });
}

// ── Reroll button ─────────────────────────────────────────────────────────────

async function handleReroll(interaction) {
  const leagueId = interaction.customId.replace("reroll_", "");
  const db = loadDB();
  const league = db.leagues[leagueId];

  if (!league || !league.active) {
    return interaction.reply({
      content: "This league is no longer active.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Only the host can reroll
  if (league.hostId !== interaction.user.id) {
    return interaction.reply({
      content: "Only the league host can reroll teams.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Edit the same message with fresh random teams
  await interaction.update({
    content: "**Teams have been randomly assigned:**",
    embeds: [buildTeamEmbed(league)],
    components: [rerollRow(league.id)],
  });
}

client.login(TOKEN);
