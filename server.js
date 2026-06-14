// server.js — Servidor HTTP para recibir instrucciones del dashboard
const express = require("express");
const { getData, setData } = require("./Events/Client/dbManager");

module.exports = function startServer(client) {
  const app = express();
  app.use(express.json());

  // CORS — permite peticiones desde cualquier origen (dashboard web)
  app.use((req, res, next) => {
    const origin = req.headers.origin || '*';
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // GET /health
  app.get("/health", (req, res) => {
    const ready = Boolean(client.user);
    const connected = client.ws?.status === 0 && ready;
    res.json({
      ok: true,
      ready,
      status: connected ? "online" : "connecting",
      bot: client.user?.tag || "conectando...",
      guildCount: client.guilds?.cache?.size ?? 0,
      websocketStatus: client.ws?.status,
    });
  });

  // GET /bot-info — devuelve nombre, avatar y actividad actual del bot
  app.get("/bot-info", (req, res) => {
    if (!client.user) return res.status(503).json({ error: "Bot no listo" });
    const presence = client.user.presence;
    const activity = presence?.activities?.[0];
    res.json({
      ok: true,
      name: client.user.username,
      tag: client.user.tag,
      avatar: client.user.displayAvatarURL({ size: 128, extension: "png" }),
      id: client.user.id,
      guildCount: client.guilds.cache.size,
      activity: activity ? {
        name: activity.name,
        type: activity.type, // número: 0=Playing,1=Streaming,2=Listening,3=Watching,5=Competing
      } : null,
      status: presence?.status || "online",
    });
  });

  // POST /send-panel
  app.post("/send-panel", async (req, res) => {
    const { channelId, embed = {}, buttons = [], selectMenus = [], staffRoleIds = [], ticketCategory = 'Tickets' } = req.body;

    if (!channelId) {
      return res.status(400).json({ error: "Falta channelId" });
    }

    try {
      const {
        EmbedBuilder,
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
        StringSelectMenuBuilder,
        StringSelectMenuOptionBuilder,
      } = require("discord.js");

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        return res.status(404).json({ error: `Canal ${channelId} no encontrado.` });
      }

      const discordEmbed = new EmbedBuilder();
      if (embed.title)       discordEmbed.setTitle(normalizeCustomEmojiMarkup(String(embed.title)).slice(0, 256));
      if (embed.description) discordEmbed.setDescription(normalizeCustomEmojiMarkup(String(embed.description)).slice(0, 4096));
      if (embed.color)       discordEmbed.setColor(embed.color);
      if (embed.author)      discordEmbed.setAuthor({ name: normalizeCustomEmojiMarkup(String(embed.author)).slice(0, 256) });
      if (embed.footer || embed.footerIcon) {
        discordEmbed.setFooter({
          text: normalizeCustomEmojiMarkup(String(embed.footer || " ")).slice(0, 2048),
          iconURL: embed.footerIcon || undefined,
        });
      }
      if (embed.thumbnail)   discordEmbed.setThumbnail(embed.thumbnail);
      if (embed.image)       discordEmbed.setImage(embed.image);

      const components = [];

      // Parsea formato de emoji de Discord: <:nombre:id>, <a:nombre:id>, URL de emoji, o solo ID.
      function parseDiscordEmoji(raw){
        const emoji = String(raw || '').trim()
        
        // Si es URL de emoji CDN, retorna como URL
        if (emoji.includes('cdn.discordapp.com') && emoji.includes('emojis')) {
          return { url: emoji, isUrl: true }
        }
        
        const full = emoji.match(/^<(a?):(\w+):(\d{10,})>$/)
        if (full) {
          return { id: full[3], name: full[2], animated: full[1] === 'a' }
        }
        const id = emoji.match(/\d{10,}/)?.[0]
        const animated = /\.gif(?:\?|$)/i.test(emoji)
        const name = emoji.match(/emojis\/\d+\/?([^\/?#.]*?)(?:\?|$)/i)?.[1] || 'emoji'
        return id ? { id, name, animated } : null
      }

      function resolveDiscordEmoji(raw){
        const emoji = parseDiscordEmoji(raw)
        if (!emoji) return null

        // Si es URL, retorna la URL directamente
        if (emoji.isUrl) {
          return emoji.url
        }

        if (emoji.animated || /<a:/.test(String(raw))) {
          return `<a:${emoji.name}:${emoji.id}>`
        }

        const cached = client.emojis.cache.get(emoji.id)
        if (cached?.animated) {
          return `<a:${cached.name || emoji.name}:${emoji.id}>`
        }

        return `<:${emoji.name}:${emoji.id}>`
      }

      function normalizeCustomEmojiMarkup(text){
        if (typeof text !== 'string' || !text.includes('<:')) return text
        return text.replace(/<a?:(\w+):(\d{10,})>/g, (match, name, id) => {
          const cached = client.emojis.cache.get(id)
          if (cached?.animated) {
            return `<a:${name}:${id}>`
          }
          return `<:${name}:${id}>`
        })
      }

      if (buttons.length > 0) {
        const styleMap = {
          primary: ButtonStyle.Primary,
          success: ButtonStyle.Success,
          danger: ButtonStyle.Danger,
          secondary: ButtonStyle.Secondary,
        };
        const row = new ActionRowBuilder();

        buttons.slice(0, 5).forEach((btn, i) => {
          const b = new ButtonBuilder().setLabel(String(btn.label || "Ticket").slice(0, 80));
          if (btn.type === "link" && btn.url) {
            b.setStyle(ButtonStyle.Link).setURL(btn.url);
          } else {
            const category = String(btn.category || "Soporte").replace(/\s+/g, "_").slice(0, 50);
            b.setStyle(styleMap[btn.style] ?? ButtonStyle.Primary)
             .setCustomId(`open_ticket_${category}_${i}`);
          }
          if (btn.emoji) {
            const emoji = resolveDiscordEmoji(btn.emoji)
            if (emoji) b.setEmoji(emoji)
          }
          row.addComponents(b);
        });
        components.push(row);
      }

      selectMenus.slice(0, 4).forEach((menu, mi) => {
        if (!Array.isArray(menu.options) || menu.options.length === 0) return;
        const select = new StringSelectMenuBuilder()
          .setCustomId(`open_ticket_select_${mi}`)
          .setPlaceholder(String(menu.label || "Selecciona una opcion").slice(0, 150));
        menu.options.slice(0, 25).forEach((opt) => {
          const option = new StringSelectMenuOptionBuilder()
            .setLabel(String(opt.label || "Opcion").slice(0, 100))
            .setValue(String(opt.label || `opcion_${mi}`).toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 100) || `opcion_${mi}`);
          if (opt.description) option.setDescription(String(opt.description).slice(0, 100));
          if (opt.emoji) {
            const emoji = resolveDiscordEmoji(opt.emoji)
            if (emoji) option.setEmoji(emoji)
          }
          select.addOptions(option);
        });
        components.push(new ActionRowBuilder().addComponents(select));
      });

      await channel.send({ embeds: [discordEmbed], components });
      console.log(`[API] Panel enviado al canal ${channelId}`);

      // Guardar staffRoleIds y categoría en la DB del servidor
      if (channel.guild?.id) {
        setData("tickets", channel.guild.id, {
          staffRoles: staffRoleIds,
          ticketCategory,
        });
      }

      res.json({ ok: true, message: "Panel publicado correctamente en Discord" });

    } catch (err) {
      console.error("[API /send-panel] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /send-embed — envía un embed puro al canal (sin botones)
  app.post("/send-embed", async (req, res) => {
    const { channelId, payload } = req.body;
    if (!channelId) return res.status(400).json({ error: "Falta channelId" });
    if (!payload) return res.status(400).json({ error: "Falta payload" });
    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return res.status(404).json({ error: `Canal ${channelId} no encontrado` });

      const sendOptions = {};
      if (payload.content) sendOptions.content = payload.content;
      if (Array.isArray(payload.embeds) && payload.embeds.length > 0) {
        const { EmbedBuilder } = require("discord.js");
        sendOptions.embeds = payload.embeds.map(e => {
          const eb = new EmbedBuilder();
          if (e.title)       eb.setTitle(e.title);
          if (e.url)         eb.setURL(e.url);
          if (e.description) eb.setDescription(e.description);
          if (e.color != null) eb.setColor(typeof e.color === 'string' ? e.color : `#${Number(e.color).toString(16).padStart(6,'0')}`);
          if (e.author?.name) eb.setAuthor({ name: e.author.name, iconURL: e.author.icon_url, url: e.author.url });
          if (e.footer?.text) eb.setFooter({ text: e.footer.text, iconURL: e.footer.icon_url });
          if (e.thumbnail?.url) eb.setThumbnail(e.thumbnail.url);
          if (e.image?.url)     eb.setImage(e.image.url);
          if (e.timestamp)      eb.setTimestamp();
          if (Array.isArray(e.fields)) eb.addFields(e.fields.map(f => ({ name: f.name||'\u200b', value: f.value||'\u200b', inline: !!f.inline })));
          return eb;
        });
      }
      if (payload.username || payload.avatar_url) {
        // webhookClient no disponible aquí, usamos el bot directamente
      }
      await channel.send(sendOptions);
      console.log(`[API] Embed enviado al canal ${channelId}`);
      res.json({ ok: true, message: "Embed enviado correctamente" });
    } catch (err) {
      console.error("[API /send-embed] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /welcome-config — guarda el mensaje automatico de bienvenida.
  app.post("/welcome-config", async (req, res) => {
    const { enabled = true, channelId, payload } = req.body;
    if (!channelId) return res.status(400).json({ error: "Falta channelId" });
    if (enabled && !payload) return res.status(400).json({ error: "Falta payload" });

    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return res.status(404).json({ error: `Canal ${channelId} no encontrado` });
      if (!channel.guild?.id) return res.status(400).json({ error: "El canal no pertenece a un servidor" });

      const config = {
        enabled: Boolean(enabled),
        channelId,
        payload: payload || { embeds: [] },
        updatedAt: new Date().toISOString(),
      };

      setData("welcome", channel.guild.id, config);
      console.log(`[API] Bienvenida guardada para ${channel.guild.name} (${channel.guild.id})`);
      res.json({ ok: true, guildId: channel.guild.id, guildName: channel.guild.name, config });
    } catch (err) {
      console.error("[API /welcome-config] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /close-ticket
  app.post("/close-ticket", async (req, res) => {
    const { channelId } = req.body;
    if (!channelId) return res.status(400).json({ error: "Falta channelId" });
    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return res.status(404).json({ error: "Canal no encontrado" });
      if (!channel.name.startsWith("ticket-")) {
        return res.status(400).json({ error: "El canal no es un ticket" });
      }
      await channel.delete("Cerrado desde el dashboard");
      res.json({ ok: true, message: "Ticket cerrado" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /set-username — cambia el username del bot
  app.post("/set-username", async (req, res) => {
    const { username } = req.body;
    if (!username || username.trim().length < 2 || username.trim().length > 32) {
      return res.status(400).json({ error: "Username inválido (2–32 caracteres)." });
    }
    try {
      await client.user.setUsername(username.trim());
      console.log(`[API] Username del bot cambiado a: ${username.trim()}`);
      res.json({ ok: true, username: client.user.username });
    } catch (err) {
      console.error("[API /set-username] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /set-activity — cambia la actividad del bot
  app.post("/set-activity", async (req, res) => {    const { activityName, activityType = "Playing", status = "online" } = req.body;
    if (!activityName) return res.status(400).json({ error: "Falta activityName" });
    const { ActivityType } = require("discord.js");
    const type = ActivityType[activityType] ?? ActivityType.Playing;
    try {
      client.user.setPresence({
        activities: [{ name: activityName, type }],
        status,
      });
      setData("bot_config", "global", { activityName, activityType, status });
      console.log(`[API] Actividad cambiada: ${activityType} ${activityName}`);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /schedule-embed — programa un embed recurrente
  app.post("/schedule-embed", async (req, res) => {
    const { channelId, embed = {}, intervalMs, label = "Embed programado" } = req.body;
    if (!channelId) return res.status(400).json({ error: "Falta channelId" });
    if (!intervalMs || intervalMs < 60000) return res.status(400).json({ error: "Intervalo mínimo: 60000ms (1 minuto)" });

    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return res.status(404).json({ error: "Canal no encontrado" });

      const id = `sched_${Date.now()}`;
      const { EmbedBuilder } = require("discord.js");

      const sendEmbed = async () => {
        try {
          const ch = await client.channels.fetch(channelId).catch(() => null);
          if (!ch) return;
          const eb = new EmbedBuilder();
          if (embed.title)       eb.setTitle(embed.title);
          if (embed.description) eb.setDescription(embed.description);
          if (embed.color)       eb.setColor(embed.color);
          if (embed.author)      eb.setAuthor({ name: embed.author });
          if (embed.footer)      eb.setFooter({ text: embed.footer });
          if (embed.thumbnail)   eb.setThumbnail(embed.thumbnail);
          if (embed.image)       eb.setImage(embed.image);
          await ch.send({ embeds: [eb] });
        } catch {}
      };

      // Enviar inmediatamente la primera vez
      await sendEmbed();

      // Programar el intervalo
      const timer = setInterval(sendEmbed, intervalMs);
      client._schedules = client._schedules || {};
      client._schedules[id] = timer;

      // Guardar en DB para persistir reinicios
      const schedules = getData("schedules", "global") || {};
      schedules[id] = { id, label, channelId, embed, intervalMs, active: true, createdAt: new Date().toISOString() };
      setData("schedules", "global", schedules);

      console.log(`[SCHEDULE] Nuevo embed programado: ${label} cada ${intervalMs}ms`);
      res.json({ ok: true, id, label });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /schedules — lista los embeds programados
  app.get("/schedules", (req, res) => {
    const schedules = getData("schedules", "global") || {};
    res.json({ ok: true, schedules: Object.values(schedules) });
  });

  // DELETE /schedule-embed/:id — detiene un embed programado
  app.delete("/schedule-embed/:id", (req, res) => {
    const { id } = req.params;
    client._schedules = client._schedules || {};
    if (client._schedules[id]) {
      clearInterval(client._schedules[id]);
      delete client._schedules[id];
    }
    const schedules = getData("schedules", "global") || {};
    if (schedules[id]) {
      schedules[id].active = false;
      setData("schedules", "global", schedules);
    }
    res.json({ ok: true, message: "Schedule detenido" });
  });

  // ── Endpoints de seguridad (AntiNuke) ────────────────────────────────────

  // POST /antinuke-config — guarda config completa desde el dashboard
  app.post("/antinuke-config", (req, res) => {
    const { guildId, config } = req.body;
    if (!guildId || !config) return res.status(400).json({ error: "Falta guildId o config" });
    try {
      setData("antinuke", guildId, config);
      console.log(`[SECURITY] Config AntiNuke actualizada para guild ${guildId}`);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /antinuke-config/:guildId — obtiene config actual del bot
  app.get("/antinuke-config/:guildId", (req, res) => {
    const config = getData("antinuke", req.params.guildId);
    res.json({ ok: true, config: config || null });
  });

  // GET /antinuke-logs/:guildId — últimos eventos de seguridad registrados
  app.get("/antinuke-logs/:guildId", (req, res) => {
    try {
      const logsPath = require("path").join(process.cwd(), "Database", "security_logs.json");
      if (!require("fs").existsSync(logsPath)) return res.json({ ok: true, logs: [] });
      const all = JSON.parse(require("fs").readFileSync(logsPath, "utf8"));
      const logs = (all[req.params.guildId] || []).slice(-200);
      res.json({ ok: true, logs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /set-logs — configura canal de logs desde el dashboard
  app.post("/set-logs", (req, res) => {
    const { guildId, channelId } = req.body;
    if (!guildId || !channelId) return res.status(400).json({ error: "Falta guildId o channelId" });
    setData("logs", guildId, { logChannelId: channelId });
    console.log(`[SECURITY] Canal de logs configurado: ${channelId} para guild ${guildId}`);
    res.json({ ok: true });
  });

  // POST /setup-leave — configura el sistema de despedida desde el dashboard
  app.post("/setup-leave", (req, res) => {
    const { guildId, channelId, title, description, color, footer, enabled } = req.body;
    if (!guildId) return res.status(400).json({ error: "Falta guildId" });
    setData("leave", guildId, { enabled: enabled !== false, channelId, title, description, color: color || "#ff0000", footer: footer || null });
    console.log(`[API] Setup-leave guardado para guild ${guildId}`);
    res.json({ ok: true });
  });

  // POST /setup-boost — configura avisos de boost desde el dashboard
  app.post("/setup-boost", (req, res) => {
    const { guildId, channelId, title, description, color, footer, enabled } = req.body;
    if (!guildId) return res.status(400).json({ error: "Falta guildId" });
    setData("boost", guildId, { enabled: enabled !== false, channelId, title, description, color: color || "#ff73fa", footer: footer || null });
    console.log(`[API] Setup-boost guardado para guild ${guildId}`);
    res.json({ ok: true });
  });

  // GET /setup-status/:guildId — devuelve el estado de todos los módulos del servidor
  app.get("/setup-status/:guildId", (req, res) => {
    const { guildId } = req.params;
    res.json({
      ok: true,
      logs: getData("logs", guildId) || null,
      welcome: getData("welcome", guildId) || null,
      leave: getData("leave", guildId) || null,
      boost: getData("boost", guildId) || null,
      tickets: getData("tickets", guildId) || null,
      antinuke: getData("antinuke", guildId) || null,
    });
  });

  // GET /emoji-proxy/:id — proxy para emojis animados de Discord (evita CORS/hotlink)
  app.get("/emoji-proxy/:id", async (req, res) => {
    const { id } = req.params;
    const animated = req.query.animated === '1';
    const ext = animated ? 'gif' : 'webp';
    const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=48&quality=lossless`;
    try {
      const https = require('https');
      https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://discord.com/' } }, (upstream) => {
        if (upstream.statusCode !== 200) return res.status(404).send('not found');
        res.setHeader('Content-Type', animated ? 'image/gif' : 'image/webp');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Access-Control-Allow-Origin', '*');
        upstream.pipe(res);
      }).on('error', () => res.status(500).send('proxy error'));
    } catch (err) {
      res.status(500).send('proxy error');
    }
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[API] Servidor HTTP escuchando en puerto ${PORT}`.green);
  });
};
