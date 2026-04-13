require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

function formatMessage(event, data) {
  switch (event) {
    case 'slot_booked':
      return `✅ <b>Slot booked!</b>\n\n📅 ${data.dateTime}\n👤 ${data.applicant}\n📍 ${data.location}\n🌍 ${data.country}\n⏰ You have ${data.minutesRemaining} minutes to complete payment.\n\n<b>Open TLSContact now to pay!</b>`;

    case 'cloudflare_challenge':
      return `⚠️ <b>Security check required</b>\n\nPlease open your browser and solve the Cloudflare challenge on TLSContact to resume monitoring.`;

    case 'session_expired':
      return `🔴 <b>Session expired</b>\n\nPlease log back into TLSContact and restart monitoring.`;

    case 'monitoring_started':
      return `🟢 <b>Monitoring started</b>\n\n🌍 ${data.country}\n📅 ${data.dateRange}\n🎯 Slot type: ${data.slotPreference}\n\nI will notify you when a slot is found.`;

    case 'heartbeat':
      return `🔄 <b>Still monitoring</b>\n\nChecks completed: ${data.totalChecks}\nLast checked: ${data.lastChecked}`;

    case 'error':
      return `❌ <b>Error occurred</b>\n\n${data.message}`;

    default:
      return `📢 ${event}: ${JSON.stringify(data)}`;
  }
}

app.post('/notify', async (req, res) => {
  try {
    const { chatId, event, data } = req.body;

    if (!chatId || !event) {
      return res.status(400).json({ error: 'chatId and event are required' });
    }

    if (!BOT_TOKEN) {
      return res.status(500).json({ error: 'BOT_TOKEN not configured' });
    }

    const text = formatMessage(event, data || {});

    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML'
        })
      }
    );

    const result = await response.json();

    if (!result.ok) {
      return res.status(500).json({
        error: 'Telegram API error',
        details: result
      });
    }

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Telegram webhook — receives updates from Telegram ───────────────────────

app.post('/telegram-webhook', async (req, res) => {
  // Always acknowledge immediately — Telegram retries if it gets no 200
  res.sendStatus(200);

  try {
    const update = req.body;
    const message = update?.message;
    if (!message) return;

    const chatId = message.chat?.id;
    const text = message.text || '';

    if (text === '/start') {
      if (!BOT_TOKEN) return;
      await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `👋 Welcome to TLS Slot Watcher!\n\nYour monitoring ID is:\n<code>${chatId}</code>\n\nCopy this number and paste it into the extension.`,
            parse_mode: 'HTML'
          })
        }
      );
    }
  } catch (err) {
    console.error('[TLS] Telegram webhook handler error:', err.message);
  }
});

// ─── Setup webhook — registers this server with Telegram ─────────────────────

app.get('/setup-webhook', async (req, res) => {
  const serverUrl = req.query.url || WEBHOOK_URL;

  if (!serverUrl) {
    return res.status(400).json({
      error: 'Provide ?url=https://your-server.com or set WEBHOOK_URL in .env'
    });
  }

  if (!BOT_TOKEN) {
    return res.status(500).json({ error: 'BOT_TOKEN not configured' });
  }

  try {
    const webhookEndpoint = serverUrl.replace(/\/$/, '') + '/telegram-webhook';
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookEndpoint)}`
    );
    const result = await response.json();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`TLS notify server running on port ${PORT}`);
});
