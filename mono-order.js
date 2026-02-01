/**
 * Ендпоінт для Oplata by Mono (Monobank).
 * Цю папку (mono-vercel) можна задеплоїти на Vercel окремо — тоді основний сайт залишається на своєму хостингу.
 *
 * Налаштування:
 * 1. Отримай токен: web.monobank.ua → Інтернет → Управління еквайрингом → Створити токен.
 * 2. На Vercel: Project → Settings → Environment Variables → додай MONO_TOKEN = твій токен.
 * 3. У script.js на основному сайті: const MONO_ORDER_URL = 'https://твій-проєкт.vercel.app/api/mono-order';
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
      name,
      surname,
      phone,
      city,
      warehouse,
      products,
      return_url,
      callback_url
    } = body;

    if (!order_ref || amount == null || !products || !Array.isArray(products) || !return_url) {
      res.status(400).json({ error: 'Missing order_ref, amount, products or return_url' });
      return;
    }

    // Mono очікує: price = ціна за одиницю (число), cnt = кількість (ціле), code_product — не порожній
    const totalAmount = Math.round(Number(amount) * 100) / 100;
    const monoProducts = products.map((p, idx) => {
      const qty = Math.max(1, Math.floor(Number(p.quantity) || 1));
      const lineTotal = Number(p.price) != null ? Number(p.price) : 0;
      const unitPrice = qty > 0 ? Math.round((lineTotal / qty) * 100) / 100 : 0;
      const codeProduct = p.id != null && p.id !== '' ? String(p.id) : `item_${idx}`;
      return {
        name: String(p.name || 'Товар').slice(0, 256),
        cnt: qty,
        price: unitPrice,
        code_product: codeProduct
      };
    });

    // Mono відхиляє non-HTTPS (bad_request) — якщо прийшов localhost, підставляємо HTTPS продакшн
    const siteUrl = (process.env.SITE_URL || 'https://tutsi-shop.com.ua').replace(/\/$/, '');
    const returnUrlIsInvalid = !return_url || !/^https:\/\//i.test(return_url) || /localhost|127\.0\.0\.1/i.test(return_url);
    const pathPart = return_url ? (return_url.replace(/^https?:\/\/[^/]+/i, '') || '/index.html') : '/index.html';
    const safeReturnUrl = returnUrlIsInvalid ? (siteUrl + (pathPart.startsWith('/') ? pathPart : '/' + pathPart)) : return_url;
    const safeCallbackUrl = (callback_url && /^https:\/\//i.test(callback_url)) ? callback_url : `${siteUrl}/api/mono-callback`;

    const monoBody = {
      order_ref: String(order_ref),
      amount: totalAmount,
      ccy: 980,
      count: products.length,
      products: monoProducts,
      dlv_method_list: ['np_brnm'],
      payment_method_list: ['card'],
      callback_url: safeCallbackUrl,
      return_url: safeReturnUrl
    };

    const response = await fetch('https://api.monobank.ua/personal/checkout/order', {
      method: 'POST',
      headers: {
        'X-Token': MONO_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(monoBody)
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data.errorDescription || data.message || data.errCode || (typeof data === 'string' ? data : 'Mono API error');
      console.error('Mono API error:', response.status, data);
      res.status(response.status).json({
        error: errMsg
      });
      return;
    }

    if (data.result && data.result.redirect_url) {
      res.status(200).json({ redirect_url: data.result.redirect_url });
      return;
    }

    res.status(500).json({ error: 'No redirect_url in Mono response' });
  } catch (e) {
    console.error('mono-order error:', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
