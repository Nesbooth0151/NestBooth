// Server NesBooth untuk Render. Tidak ada API key yang disimpan di Git.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const crypto = require('node:crypto');

const root = __dirname;
const port = Number(process.env.PORT || 3092);
const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const midtransServerKey = process.env.MIDTRANS_SERVER_KEY || '';
const midtransClientKey = process.env.MIDTRANS_CLIENT_KEY || '';
const midtransProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
const midtransBase = midtransProduction ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json'
};

function jakartaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers});
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', part => { body += part; if (body.length > 1_000_000) reject(new Error('Permintaan terlalu besar')); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('JSON tidak valid')); } });
    req.on('error', reject);
  });
}

async function db(endpoint, options = {}) {
  if (!supabaseUrl || !supabaseKey) throw new Error('Database belum dikonfigurasi');
  const response = await fetch(`${supabaseUrl}/rest/v1/${endpoint}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(typeof data === 'object' ? (data.message || data.hint || 'Database gagal diproses') : 'Database gagal diproses');
  return data;
}

async function bootstrap() {
  const [settings, products, materials, recipes, queues, sales] = await Promise.all([
    db('store_settings?select=*&id=eq.1'),
    db('products?select=*&is_active=eq.true&order=created_at.asc'),
    db('materials?select=*&order=name.asc'),
    db('product_recipes?select=*'),
    db('queue_items?select=*&status=neq.Selesai&order=created_at.asc'),
    db('sales?select=*&order=created_at.desc&limit=500')
  ]);
  return {settings: settings[0] || null, products, materials, recipes, queues, sales};
}

async function createSale(payload) {
  const quote = await prepareSale(payload);
  const created = await db('rpc/create_pos_sale', {method: 'POST', body: JSON.stringify({
    p_items: quote.items, p_subtotal: quote.subtotal, p_tax_amount: 0, p_total: quote.total,
    p_payment_method: quote.method, p_receipt_number: quote.receiptNumber,
    p_queue_prefix: quote.prefix, p_queue_date: quote.queueDate
  })});
  if (!created?.sale || !created?.queue) throw new Error('Transaksi dan antrean tidak berhasil dibuat');
  return {sale: created.sale, queue: created.queue, taxPercent: 0};
}

async function prepareSale(payload, methodOverride) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw new Error('Pesanan kosong');
  const [settingsRows, productRows] = await Promise.all([
    db('store_settings?select=*&id=eq.1'),
    db('products?select=id,name,price&is_active=eq.true')
  ]);
  const products = new Map(productRows.map(product => [product.name, product]));
  const safeItems = items.map(item => {
    const name = String(item.name || '').trim();
    const baseName = name.split(' — ')[0];
    const product = products.get(baseName);
    const qty = Math.max(1, Math.min(100, Number(item.qty) || 1));
    if (!product) throw new Error(`Menu ${baseName} tidak ditemukan`);
    const price = Number(item.price) || Number(product.price);
    return {name, qty, price};
  });
  const subtotal = safeItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const total = subtotal;
  const prefix = String(settingsRows[0]?.queue_prefix || 'A').toUpperCase();
  const jakartaToday = jakartaDate();
  return {
    items: safeItems, subtotal, total, prefix, queueDate: jakartaToday,
    receiptNumber: `NB${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`,
    method: methodOverride || (payload.method === 'QRIS' ? 'QRIS' : 'Tunai')
  };
}

function ensureMidtransConfigured() {
  if (!midtransServerKey || !midtransClientKey) throw new Error('Midtrans belum dikonfigurasi di Render');
}

async function midtransRequest(endpoint, body) {
  const response = await fetch(`${midtransBase}${endpoint}`, {
    method: 'POST', headers: {
      Authorization: `Basic ${Buffer.from(`${midtransServerKey}:`).toString('base64')}`,
      'Content-Type': 'application/json', Accept: 'application/json'
    }, body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_messages?.[0] || data.status_message || 'Midtrans tidak dapat membuat pembayaran');
  return data;
}

async function createMidtransPayment(payload) {
  ensureMidtransConfigured();
  const quote = await prepareSale(payload, 'QRIS');
  const orderId = `NB-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const pending = await db('payment_orders', {method: 'POST', body: JSON.stringify({
    order_id: orderId, status: 'pending', gross_amount: quote.total, items: quote.items,
    receipt_number: quote.receiptNumber, queue_prefix: quote.prefix, queue_date: quote.queueDate,
    payment_method: 'QRIS'
  })});
  if (!pending?.[0]) throw new Error('Pesanan pembayaran tidak dapat disiapkan');
  try {
    const result = await midtransRequest('/snap/v1/transactions', {
      transaction_details: {order_id: orderId, gross_amount: quote.total},
      item_details: quote.items.map((item, index) => ({id: `item-${index + 1}`, name: item.name.slice(0, 50), price: item.price, quantity: item.qty})),
      enabled_payments: ['gopay', 'shopeepay']
    });
    return {orderId, token: result.token, redirectUrl: result.redirect_url, receiptNumber: quote.receiptNumber, subtotal: quote.subtotal, total: quote.total};
  } catch (error) {
    await db(`payment_orders?order_id=eq.${encodeURIComponent(orderId)}`, {method: 'PATCH', body: JSON.stringify({status: 'failed'})});
    throw error;
  }
}

function isMidtransSignatureValid(payload) {
  const given = String(payload.signature_key || '');
  const expected = crypto.createHash('sha512').update(`${payload.order_id || ''}${payload.status_code || ''}${payload.gross_amount || ''}${midtransServerKey}`).digest('hex');
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function midtransSucceeded(payload) {
  return payload.transaction_status === 'settlement' || (payload.transaction_status === 'capture' && payload.fraud_status === 'accept');
}

async function handleMidtransNotification(payload) {
  ensureMidtransConfigured();
  if (!isMidtransSignatureValid(payload)) throw new Error('Tanda tangan Midtrans tidak valid');
  const orderId = String(payload.order_id || '');
  if (!orderId) throw new Error('Order Midtrans tidak valid');
  const orders = await db(`payment_orders?order_id=eq.${encodeURIComponent(orderId)}&select=*`);
  const order = orders[0];
  if (!order) throw new Error('Order pembayaran tidak ditemukan');
  const transactionStatus = String(payload.transaction_status || '');
  await db(`payment_orders?order_id=eq.${encodeURIComponent(orderId)}`, {method: 'PATCH', body: JSON.stringify({midtrans_status: transactionStatus, midtrans_transaction_id: payload.transaction_id || null})});
  if (!midtransSucceeded(payload) || order.sale_id) return {ok: true};
  const claimed = await db(`payment_orders?order_id=eq.${encodeURIComponent(orderId)}&sale_id=is.null&status=eq.pending`, {method: 'PATCH', body: JSON.stringify({status: 'processing'})});
  if (!claimed?.[0]) return {ok: true};
  try {
    const created = await db('rpc/create_pos_sale', {method: 'POST', body: JSON.stringify({
      p_items: order.items, p_subtotal: Number(order.gross_amount), p_tax_amount: 0, p_total: Number(order.gross_amount),
      p_payment_method: 'QRIS', p_receipt_number: order.receipt_number,
      p_queue_prefix: order.queue_prefix, p_queue_date: order.queue_date
    })});
    if (!created?.sale || !created?.queue) throw new Error('Transaksi QRIS tidak berhasil dibuat');
    await db(`payment_orders?order_id=eq.${encodeURIComponent(orderId)}`, {method: 'PATCH', body: JSON.stringify({status: 'paid', sale_id: created.sale.id})});
  } catch (error) {
    await db(`payment_orders?order_id=eq.${encodeURIComponent(orderId)}`, {method: 'PATCH', body: JSON.stringify({status: 'pending'})});
    throw error;
  }
  return {ok: true};
}

async function midtransPaymentStatus(url) {
  const orderId = String(url.searchParams.get('order_id') || '');
  if (!/^NB-[0-9]+-[0-9a-f]+$/i.test(orderId)) throw new Error('Order pembayaran tidak valid');
  const rows = await db(`payment_orders?order_id=eq.${encodeURIComponent(orderId)}&select=*`);
  const order = rows[0];
  if (!order) throw new Error('Order pembayaran tidak ditemukan');
  let queue = null;
  if (order.sale_id) queue = (await db(`queue_items?sale_id=eq.${encodeURIComponent(order.sale_id)}&select=id,queue_number,item_count`))[0] || null;
  return {status: order.status, midtransStatus: order.midtrans_status || 'pending', saleId: order.sale_id || null, queue};
}

async function updateQueueStatus(payload) {
  const id = String(payload.id || '');
  const status = String(payload.status || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Antrean tidak valid');
  if (!['Menunggu', 'Diproses', 'Selesai'].includes(status)) throw new Error('Status antrean tidak valid');
  const rows = await db(`queue_items?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({status})
  });
  if (!rows?.[0]) throw new Error('Antrean tidak ditemukan');
  return rows[0];
}

async function manageSale(payload) {
  const id = String(payload.id || '');
  const action = String(payload.action || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Transaksi tidak valid');
  if (!['cancel', 'refund', 'payment_method'].includes(action)) throw new Error('Aksi transaksi tidak valid');
  const result = await db('rpc/manage_pos_sale', {method: 'POST', body: JSON.stringify({
    p_sale_id: id, p_action: action, p_payment_method: payload.payment_method || null
  })});
  if (!result?.id) throw new Error('Transaksi tidak dapat diperbarui');
  return result;
}

async function saveRecipe(payload) {
  const product_id = String(payload.product_id || ''), material_id = String(payload.material_id || '');
  const variant = String(payload.variant || '').trim();
  const amount = Number(payload.amount);
  if (!/^[0-9a-f-]{36}$/i.test(product_id) || !/^[0-9a-f-]{36}$/i.test(material_id) || variant.length > 80 || !Number.isFinite(amount) || amount <= 0) throw new Error('Data resep tidak valid');
  const filter = `product_id=eq.${encodeURIComponent(product_id)}&material_id=eq.${encodeURIComponent(material_id)}&variant=eq.${encodeURIComponent(variant)}`;
  const existing = await db(`product_recipes?select=product_id&${filter}`);
  if (existing.length) return (await db(`product_recipes?${filter}`, {method: 'PATCH', body: JSON.stringify({amount})}))[0];
  return (await db('product_recipes', {method: 'POST', body: JSON.stringify({product_id, material_id, variant, amount})}))[0];
}

async function deleteRecipe(url) {
  const product_id = String(url.searchParams.get('product_id') || ''), material_id = String(url.searchParams.get('material_id') || '');
  const variant = String(url.searchParams.get('variant') || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(product_id) || !/^[0-9a-f-]{36}$/i.test(material_id) || variant.length > 80) throw new Error('Resep tidak valid');
  return db(`product_recipes?product_id=eq.${encodeURIComponent(product_id)}&material_id=eq.${encodeURIComponent(material_id)}&variant=eq.${encodeURIComponent(variant)}`, {method: 'DELETE'});
}

function cleanName(value, label) {
  const text = String(value || '').trim();
  if (!text || text.length > 120) throw new Error(`${label} tidak valid`);
  return text;
}

function reportDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new Error(`${label} tidak valid`);
  return value;
}

async function salesReport(from, to) {
  const start = reportDate(from, 'Tanggal awal');
  const end = reportDate(to, 'Tanggal akhir');
  if (start > end) throw new Error('Rentang tanggal tidak valid');
  const startTime = new Date(`${start}T00:00:00+07:00`).toISOString();
  const nextDate = new Date(`${end}T00:00:00+07:00`); nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const endTime = nextDate.toISOString();
  return db(`sales?select=*&created_at=gte.${encodeURIComponent(startTime)}&created_at=lt.${encodeURIComponent(endTime)}&order=created_at.desc&limit=5000`);
}

async function saveSettings(payload) {
  const store_name = cleanName(payload.store_name, 'Nama toko');
  const tax_percent = 0;
  const queue_prefix = cleanName(payload.queue_prefix, 'Awalan antrean').toUpperCase().slice(0, 4);
  const rows = await db('store_settings?id=eq.1', {method: 'PATCH', body: JSON.stringify({store_name, tax_percent, queue_prefix})});
  if (!rows?.[0]) throw new Error('Pengaturan toko tidak ditemukan');
  return rows[0];
}

async function saveProduct(payload, id) {
  const name = cleanName(payload.name, 'Nama menu');
  const category = cleanName(payload.category, 'Kategori');
  const price = Number(payload.price);
  if (!Number.isFinite(price) || price < 0) throw new Error('Harga menu tidak valid');
  const body = {name, category, price: Math.round(price)};
  if (!id) return (await db('products', {method: 'POST', body: JSON.stringify({...body, is_active: true})}))[0];
  return (await db(`products?id=eq.${encodeURIComponent(id)}`, {method: 'PATCH', body: JSON.stringify(body)}))[0];
}

async function saveMaterial(payload, id) {
  const name = cleanName(payload.name, 'Nama bahan');
  const unit = cleanName(payload.unit, 'Satuan').toLowerCase();
  const stock = Number(payload.stock);
  const min_stock = Number(payload.min_stock ?? 0);
  if (!['gram', 'ml', 'pcs'].includes(unit) || !Number.isFinite(stock) || stock < 0 || !Number.isFinite(min_stock) || min_stock < 0) throw new Error('Data bahan tidak valid');
  const body = {name, unit, stock, min_stock};
  if (!id) return (await db('materials', {method: 'POST', body: JSON.stringify(body)}))[0];
  return (await db(`materials?id=eq.${encodeURIComponent(id)}`, {method: 'PATCH', body: JSON.stringify(body)}))[0];
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/health') return send(res, 200, {ok: true, databaseConfigured: Boolean(supabaseUrl && supabaseKey)});
    if (url.pathname === '/api/midtrans/config' && req.method === 'GET') return send(res, 200, {configured: Boolean(midtransServerKey && midtransClientKey), clientKey: midtransClientKey || null, snapUrl: `${midtransBase}/snap/snap.js`});
    if (url.pathname === '/api/midtrans/payment' && req.method === 'POST') return send(res, 201, await createMidtransPayment(await readBody(req)));
    if (url.pathname === '/api/midtrans/notification' && req.method === 'POST') return send(res, 200, await handleMidtransNotification(await readBody(req)));
    if (url.pathname === '/api/midtrans/status' && req.method === 'GET') return send(res, 200, await midtransPaymentStatus(url));
    if (url.pathname === '/api/bootstrap' && req.method === 'GET') return send(res, 200, await bootstrap());
    if (url.pathname === '/api/reports/sales' && req.method === 'GET') return send(res, 200, {sales: await salesReport(url.searchParams.get('from'), url.searchParams.get('to'))});
    if (url.pathname === '/api/sales' && req.method === 'POST') return send(res, 201, await createSale(await readBody(req)));
    if (url.pathname === '/api/sales/manage' && req.method === 'PUT') return send(res, 200, await manageSale(await readBody(req)));
    if (url.pathname === '/api/settings' && req.method === 'PUT') return send(res, 200, await saveSettings(await readBody(req)));
    if (url.pathname === '/api/products' && req.method === 'POST') return send(res, 201, await saveProduct(await readBody(req)));
    if (url.pathname === '/api/products' && req.method === 'PUT') return send(res, 200, await saveProduct(await readBody(req), url.searchParams.get('id')));
    if (url.pathname === '/api/products' && req.method === 'DELETE') return send(res, 200, await db(`products?id=eq.${encodeURIComponent(url.searchParams.get('id') || '')}`, {method: 'PATCH', body: JSON.stringify({is_active: false})}));
    if (url.pathname === '/api/materials' && req.method === 'POST') return send(res, 201, await saveMaterial(await readBody(req)));
    if (url.pathname === '/api/materials' && req.method === 'PUT') return send(res, 200, await saveMaterial(await readBody(req), url.searchParams.get('id')));
    if (url.pathname === '/api/materials' && req.method === 'DELETE') return send(res, 200, await db(`materials?id=eq.${encodeURIComponent(url.searchParams.get('id') || '')}`, {method: 'DELETE'}));
    if (url.pathname === '/api/recipes' && req.method === 'POST') return send(res, 201, await saveRecipe(await readBody(req)));
    if (url.pathname === '/api/recipes' && req.method === 'DELETE') return send(res, 200, await deleteRecipe(url));
    if (url.pathname === '/api/queue' && req.method === 'GET') {
      if (!supabaseUrl || !supabaseKey) return send(res, 200, {queue: [], current: 0});
      const items = await db('queue_items?select=*&status=neq.Selesai&order=created_at.asc');
      const queue = items.map(item => ({id: item.id, n: item.queue_number, name: '', items: `${item.item_count} item`, status: item.status}));
      return send(res, 200, {queue, current: Math.max(0, queue.findIndex(item => item.status === 'Diproses'))});
    }
    if (url.pathname === '/api/queue' && req.method === 'PUT') return send(res, 200, await updateQueueStatus(await readBody(req)));
  } catch (error) {
    return send(res, 500, {error: error.message || 'Terjadi kesalahan server'});
  }

  const requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.resolve(root, requested);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'}); return res.end('Halaman tidak ditemukan');
  }
  res.writeHead(200, {'Content-Type': mime[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});

server.listen(port, '0.0.0.0', () => console.log(`NesBooth berjalan di port ${port}`));
