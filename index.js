const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  REST,
  Routes,
} = require("discord.js");
const fs = require("fs");

const DB_PATH = "./database.json";

const LEAGUE_CHANNEL_ID = "1509081893956620458";
const LEAGUE_HOST_ROLE_ID = "1458681148845850687";
const LEAGUES_PING_ROLE_ID = "1458492503211774097";

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ leagues: {} }, null, 2));
  }
  const raw = fs.readFileSync(DB_PATH, "utf8");
  return JSON.parse(raw);
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function generateLeagueId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function getTotalSpots(format) {
  const map = { "2v2": 4, "3v3": 6, "4v4": 8 };
  return map[format];
}

function buildLeagueEmbed(league) {
  const spotsLeft = league.totalSpots - league.players.length;
  const playerMentions =
    league.players.map((id) => `<@${id}>`).join("\n") || "None";

  return new EmbedBuilder()
    .setTitle("League Available")
    .addFields(
      { name: "Format", value: league.format, inline: true },
      { name: "Match Type", value: league.matchType, inline: true },
      { name: "Perks", value: league.perks, inline: true },
      { name: "Region", value: league.region, inline: true },
      { name: "Host", value: `<@${league.hostId}>`, inline: true },
      {
        name: "Spots Left",
        value: `${spotsLeft} / ${league.totalSpots}`,
        inline: true,
      },
      { name: "Players", value: playerMentions },
      { name: "League ID", value: league.id }
    )
    .setFooter({ text: `Cancel: /league cancel id:${league.id}` })
    .setColor(0x5865f2);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("league")
      .setDescription("League commands")
      .addSubcommand((sub) =>
        sub
          .setName("host")
          .setDescription("Host a league")
          .addStringOption((opt) =>
            opt
              .setName("format")
              .setDescription("Match format")
              .setRequired(true)
              .addChoices(
                { name: "2v2", value: "2v2" },
                { name: "3v3", value: "3v3" },
                { name: "4v4", value: "4v4" }
              )
          )
          .addStringOption((opt) =>
            opt
              .setName("match_type")
              .setDescription("Match type")
              .setRequired(true)
              .addChoices(
                { name: "Swift Game", value: "Swift Game" },
                { name: "War Game", value: "War Game" }
              )
          )
          .addStringOption((opt) =>
            opt
              .setName("perks")
              .setDescription("Perks setting")
              .setRequired(true)
              .addChoices(
                { name: "Perks", value: "Perks" },
                { name: "No Perks", value: "No Perks" }
              )
          )
          .addStringOption((opt) =>
            opt
              .setName("region")
              .setDescription("Region")
              .setRequired(true)
              .addChoices(
                { name: "Europe", value: "Europe" },
                { name: "Asia", value: "Asia" },
                { name: "North America", value: "North America" },
                { name: "South America", value: "South America" },
                { name: "Ocean", value: "Ocean" }
              )
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("cancel")
          .setDescription("Cancel a league")
          .addStringOption((opt) =>
            opt
              .setName("id")
              .setDescription("League ID to cancel")
              .setRequired(true)
          )
      )
      .toJSON(),
  ];

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  for (const [guildId] of client.guilds.cache) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: commands }
      );
      console.log(`Commands registered for guild: ${guildId}`);
    } catch (err) {
      console.error(`Failed to register commands for guild ${guildId}:`, err);
    }
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const sub = interaction.options.getSubcommand();

    if (interaction.commandName === "league") {
      if (sub === "host") {
        if (interaction.channelId !== LEAGUE_CHANNEL_ID) {
          return interaction.reply({
            content: `Leagues can only be hosted in <#${LEAGUE_CHANNEL_ID}>.`,
            ephemeral: true,
          });
        }

        if (!interaction.member.roles.cache.has(LEAGUE_HOST_ROLE_ID)) {
          return interaction.reply({
            content:
              "You do not have permission to host leagues. The League Host role is required.",
            ephemeral: true,
          });
        }

        const format = interaction.options.getString("format");
        const matchType = interaction.options.getString("match_type");
        const perks = interaction.options.getString("perks");
        const region = interaction.options.getString("region");

        const db = loadDB();

        const existing = Object.values(db.leagues).find(
          (l) => l.hostId === interaction.user.id && l.active
        );
        if (existing) {
          return interaction.reply({
            content: `You already have an active league (ID: **${existing.id}**). Cancel it first before hosting a new one.`,
            ephemeral: true,
          });
        }

        let leagueId;
        do {
          leagueId = generateLeagueId();
        } while (db.leagues[leagueId]);

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

        const embed = buildLeagueEmbed(league);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`join_${leagueId}`)
            .setLabel("Join League")
            .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({
          content: `League **${leagueId}** has been created.`,
          ephemeral: true,
        });

        const msg = await interaction.channel.send({
          embeds: [embed],
          components: [row],
        });

        db.leagues[leagueId].messageId = msg.id;
        saveDB(db);

        await interaction.channel.send(
          `<@&${LEAGUES_PING_ROLE_ID}> New league available: **${leagueId}**`
        );
      }

      if (sub === "cancel") {
        if (!interaction.member.roles.cache.has(LEAGUE_HOST_ROLE_ID)) {
          return interaction.reply({
            content: "You do not have permission to cancel leagues.",
            ephemeral: true,
          });
        }

        const leagueId = interaction.options
          .getString("id")
          .trim()
          .toUpperCase();
        const db = loadDB();
        const league = db.leagues[leagueId];

        if (!league || !league.active) {
          return interaction.reply({
            content: `No active league found with ID: **${leagueId}**`,
            ephemeral: true,
          });
        }

        if (
          league.hostId !== interaction.user.id &&
          !interaction.member.permissions.has(
            PermissionFlagsBits.Administrator
          )
        ) {
          return interaction.reply({
            content: "You can only cancel leagues that you hosted.",
            ephemeral: true,
          });
        }

        db.leagues[leagueId].active = false;
        saveDB(db);

        try {
          const channel = await client.channels.fetch(league.channelId);
          const msg = await channel.messages.fetch(league.messageId);

          const cancelEmbed = new EmbedBuilder()
            .setTitle("League Cancelled")
            .setDescription(
              `League **${leagueId}** has been cancelled by <@${interaction.user.id}>.`
            )
            .setColor(0xed4245);

          await msg.edit({ embeds: [cancelEmbed], components: [] });
        } catch (e) {
          console.error("Error editing cancelled league message:", e);
        }

        if (league.threadId) {
          try {
            const thread = await client.channels.fetch(league.threadId);
            await thread.send(
              `This league (ID: **${leagueId}**) has been cancelled. This thread will now be archived.`
            );
            await thread.setArchived(true);
          } catch (e) {
            console.error("Error archiving thread:", e);
          }
        }

        return interaction.reply({
          content: `League **${leagueId}** has been cancelled.`,
          ephemeral: true,
        });
      }
    }
  }

  if (interaction.isButton()) {
    const { customId } = interaction;

    if (customId.startsWith("join_")) {
      const leagueId = customId.replace("join_", "");
      const db = loadDB();
      const league = db.leagues[leagueId];

      if (!league || !league.active) {
        return interaction.reply({
          content: "This league is no longer available.",
          ephemeral: true,
        });
      }

      if (league.players.includes(interaction.user.id)) {
        return interaction.reply({
          content: "You have already joined this league.",
          ephemeral: true,
        });
      }

      if (league.players.length >= league.totalSpots) {
        return interaction.reply({
          content: "This league is full.",
          ephemeral: true,
        });
      }

      db.leagues[leagueId].players.push(interaction.user.id);
      saveDB(db);

      const updated = db.leagues[leagueId];
      const spotsLeft = updated.totalSpots - updated.players.length;
      const embed = buildLeagueEmbed(updated);

      const components =
        spotsLeft > 0
          ? [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`join_${leagueId}`)
                  .setLabel("Join League")
                  .setStyle(ButtonStyle.Primary)
              ),
            ]
          : [];

      await interaction.update({ embeds: [embed], components });

      if (spotsLeft === 0) {
        try {
          const channel = await client.channels.fetch(league.channelId);

          const thread = await channel.threads.create({
            name: `League ${leagueId} — ${updated.format} ${updated.matchType}`,
            autoArchiveDuration: 1440,
            type: ChannelType.PrivateThread,
            reason: `Private match thread for league ${leagueId}`,
          });

          for (const playerId of updated.players) {
            try {
              await thread.members.add(playerId);
            } catch (e) {
              console.error(`Failed to add player ${playerId} to thread:`, e);
            }
          }

          const playerList = updated.players
            .map((id) => `<@${id}>`)
            .join(", ");

          await thread.send({
            content: [
              `**League ${leagueId} — ${updated.format} ${updated.matchType}**`,
              ``,
              `Format: **${updated.format}**  |  Match Type: **${updated.matchType}**  |  Perks: **${updated.perks}**  |  Region: **${updated.region}**`,
              ``,
              `All spots have been filled. This is your private match thread.`,
              ``,
              `Players: ${playerList}`,
            ].join("\n"),
          });

          db.leagues[leagueId].threadId = thread.id;
          saveDB(db);
        } catch (err) {
          console.error("Error creating private thread:", err);
        }
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
