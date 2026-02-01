/**
 * Webhook від Monobank: після успішної оплати Mono викликає цей URL (POST).
 * Тут надсилаємо підтвердження в Telegram.
 *
 * На Vercel додай Environment Variables:
 * - TELEGRAM_BOT_TOKEN — токен бота (@BotFather)
 * - TELEGRAM_CHAT_ID — ID чату для повідомлень
 */

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const status = (body.status || '').toLowerCase();
    const referenceRaw = body.reference || body.order_ref || body.invoiceId || '';
    const amount = body.amount != null ? body.amount / 100 : (body.finalAmount != null ? body.finalAmount / 100 : 0);
    const invoiceId = body.invoiceId || '';

    const isSuccess = status === 'success' || status === 'completed' || status === 'done';

    if (!isSuccess) {
      res.status(200).end();
      return;
    }

    if (!BOT_TOKEN || !CHAT_ID) {
      console.error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set');
      res.status(200).end();
      return;
    }

    let orderData = null;
    try {
      const base64 = referenceRaw.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      const json = Buffer.from(padded, 'base64').toString('utf8');
      orderData = JSON.parse(json);
    } catch (_) {}

    const amountStr = amount ? `${Number(amount).toFixed(2)} ₴` : '';
    let message = `✅ <b>Оплата через Mono — оплачено</b>\n\n`;
    if (orderData && orderData.id) message += `📋 Замовлення: <code>${orderData.id}</code>\n`;
    else if (referenceRaw) message += `📋 Замовлення: <code>${referenceRaw}</code>\n`;
    if (amountStr) message += `💰 Сума: ${amountStr}\n`;

    if (orderData) {
      if (orderData.n || orderData.s || orderData.p) {
        message += `\n👤 <b>Отримувач:</b>\n`;
        if (orderData.n || orderData.s) message += `${(orderData.n || '').trim()} ${(orderData.s || '').trim()}\n`.trim() + '\n';
        if (orderData.p) message += `📞 ${orderData.p}\n`;
      }
      if (orderData.c || orderData.w) {
        message += `\n📍 <b>Доставка:</b>\n`;
        if (orderData.c) message += `Місто: ${orderData.c}\n`;
        if (orderData.r) message += `Область: ${orderData.r}\n`;
        if (orderData.w) message += `Відділення: ${orderData.w}\n`;
      }
      if (orderData.items && orderData.items.length) {
        message += `\n🛒 <b>Товари:</b>\n`;
        orderData.items.forEach(i => {
          message += `• ${i.n} x${i.q} — ${Number(i.pr).toFixed(2)} ₴\n`;
        });
      }
    }

    if (invoiceId) message += `\n🆔 InvoiceId: ${invoiceId}\n`;
    message += `\n📅 ${new Date().toLocaleString('uk-UA', { dateStyle: 'medium', timeStyle: 'short' })}`;

    const apiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      })
    });
  } catch (e) {
    console.error('mono-callback error:', e);
  }

  res.status(200).end();
};
