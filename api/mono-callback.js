/**
 * Webhook від Monobank: після успішної оплати Mono викликає цей URL (POST).
 * Тут надсилаємо підтвердження в Telegram.
 *
 * Налаштування на Vercel (Environment Variables):
 * - MONO_TOKEN (вже є для mono-order)
 * - TELEGRAM_BOT_TOKEN — токен бота (@BotFather)
 * - TELEGRAM_CHAT_ID — ID чату, куди слати повідомлення
 *
 * У script.js callback_url має вказувати на цей ендпоінт, наприклад:
 * https://твій-проєкт.vercel.app/api/mono-callback
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
    const reference = body.reference || body.order_ref || body.invoiceId || '';
    const amount = body.amount != null ? body.amount / 100 : (body.finalAmount != null ? body.finalAmount / 100 : 0);
    const invoiceId = body.invoiceId || '';

    // Успішна оплата: status може бути "success" або "completed"
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

    const amountStr = amount ? `${Number(amount).toFixed(2)} ₴` : '';
    let message = `✅ <b>Оплата через Mono здійснена</b>\n\n`;
    if (reference) message += `📋 Замовлення: <code>${reference}</code>\n`;
    if (amountStr) message += `💰 Сума: ${amountStr}\n`;
    if (invoiceId) message += `🆔 InvoiceId: ${invoiceId}\n`;
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

  // Завжди повертаємо 200, щоб Mono не повторював запит
  res.status(200).end();
};
