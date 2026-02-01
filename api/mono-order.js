/**
 * Ендпоінт для Інтернет-еквайрингу Monobank (Створення рахунку).
 * Документація: https://monobank.ua/api-docs/acquiring/methods/ia/post--api--merchant--invoice--create
 *
 * Налаштування:
 * 1. Отримай токен: web.monobank.ua → Інтернет еквайринг → Управління еквайрингом → Створити токен.
 * 2. На Vercel: Project → Settings → Environment Variables → додай MONO_TOKEN = твій токен.
 * 3. У script.js: const MONO_ORDER_URL = 'https://твій-проєкт.vercel.app/api/mono-order';
 */

function setCors(res, req) {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  setCors(res, req);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const MONO_TOKEN = process.env.MONO_TOKEN;
  if (!MONO_TOKEN) {
    res.status(500).json({ error: 'MONO_TOKEN not set. Add it in Vercel → Settings → Environment Variables.' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const {
      order_ref,
      amount,
      products,
      return_url,
      callback_url
    } = body;

    if (!order_ref || amount == null || !return_url) {
      res.status(400).json({ error: 'Missing order_ref, amount or return_url' });
      return;
    }

    // API створення рахунку: amount у КОПІЙКАХ (мінімальні одиниці)
    const totalAmountUAH = Math.round(Number(amount) * 100) / 100;
    if (totalAmountUAH <= 0) {
      res.status(400).json({ error: 'Сума замовлення має бути більше 0' });
      return;
    }
    const amountKop = Math.round(totalAmountUAH * 100);

    const siteUrl = (process.env.SITE_URL || 'https://tutsi-shop.com.ua').replace(/\/$/, '');
    const returnUrlIsInvalid = !return_url || !/^https:\/\//i.test(return_url) || /localhost|127\.0\.0\.1/i.test(return_url);
    const pathPart = return_url ? (return_url.replace(/^https?:\/\/[^/]+/i, '') || '/index.html') : '/index.html';
    const redirectUrl = returnUrlIsInvalid ? (siteUrl + (pathPart.startsWith('/') ? pathPart : '/' + pathPart)) : return_url;
    const webHookUrl = (callback_url && /^https:\/\//i.test(callback_url)) ? callback_url : `${siteUrl}/api/mono-callback`;

    // Згідно документації: amount (копійки), ccy, redirectUrl, webHookUrl
    const monoBody = {
      amount: amountKop,
      ccy: 980,
      redirectUrl,
      webHookUrl,
      validity: 86400,
      paymentType: 'debit'
    };

    // merchantPaymInfo — опційно, для відображення на сторінці оплати (reference, destination)
    if (order_ref) {
      monoBody.merchantPaymInfo = {
        reference: String(order_ref),
        destination: 'Замовлення ' + String(order_ref),
        comment: products && Array.isArray(products) && products.length
          ? products.map(p => (p.name || 'Товар') + ' x' + (p.quantity || 1)).join(', ').slice(0, 500)
          : 'Оплата замовлення'
      };
    }

    console.log('Mono invoice/create request:', JSON.stringify({ ...monoBody, merchantPaymInfo: monoBody.merchantPaymInfo }, null, 2));

    const response = await fetch('https://api.monobank.ua/api/merchant/invoice/create', {
      method: 'POST',
      headers: {
        'X-Token': MONO_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(monoBody)
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data.errText || data.errorDescription || data.message || data.errCode || (typeof data === 'object' ? JSON.stringify(data) : data) || 'Mono API error';
      console.error('Mono API error:', response.status, JSON.stringify(data));
      res.status(response.status).json({
        error: errMsg,
        errCode: data.errCode,
        errText: data.errText
      });
      return;
    }

    // Відповідь: invoiceId, pageUrl (посилання на оплату)
    if (data.pageUrl) {
      res.status(200).json({ redirect_url: data.pageUrl, invoiceId: data.invoiceId });
      return;
    }

    res.status(500).json({ error: 'No pageUrl in Mono response' });
  } catch (e) {
    console.error('mono-order error:', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
