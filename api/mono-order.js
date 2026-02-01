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

    // Mono очікує price = ціна за ОДИНИЦЮ (за 1 шт.), cnt = кількість
    const totalAmount = Math.round(Number(amount) * 100) / 100;
    const monoProducts = products.map((p) => {
      const qty = Number(p.quantity) || 1;
      const lineTotal = Number(p.price) != null ? Number(p.price) : 0;
      const unitPrice = qty > 0 ? Math.round((lineTotal / qty) * 100) / 100 : 0;
      return {
        name: String(p.name || ''),
        cnt: qty,
        price: unitPrice,
        code_product: p.id != null ? String(p.id) : ''
      };
    });

    const monoBody = {
      order_ref,
      amount: totalAmount,
      ccy: 980,
      count: products.length,
      products: monoProducts,
      dlv_method_list: ['np_brnm'],
      payment_method_list: ['card'],
      callback_url: callback_url || `${req.headers.origin || ''}/mono-callback.html`,
      return_url
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
