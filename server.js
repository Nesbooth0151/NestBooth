// Server NesBooth untuk Render. Tidak ada API key yang disimpan di Git.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const root = __dirname;
const port = Number(process.env.PORT || 3092);
const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
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
  const [settings, products, materials, queues, sales] = await Promise.all([
    db('store_settings?select=*&id=eq.1'),
    db('products?select=*&is_active=eq.true&order=created_at.asc'),
    db('materials?select=*&order=name.asc'),
    db('queue_items?select=*&status=neq.Selesai&order=created_at.asc'),
    db('sales?select=*&order=created_at.desc&limit=500')
  ]);
  return {settings: settings[0] || null, products, materials, queues, sales};
}

async function createSale(payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw new Error('Pesanan kosong');
  const [settingsRows, productRows, queueRows] = await Promise.all([
    db('store_settings?select=*&id=eq.1'),
    db('products?select=id,name,price&is_active=eq.true'),
    db('queue_items?select=queue_number,queue_date&queue_date=eq.' + jakartaDate() + '&order=created_at.desc&limit=1000')
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
  const taxPercent = Number(settingsRows[0]?.tax_percent ?? 11);
  const taxAmount = Math.round(subtotal * taxPercent / 100);
  const total = subtotal + taxAmount;
  const prefix = String(settingsRows[0]?.queue_prefix || 'A').toUpperCase();
  const jakartaToday = jakartaDate();
  const todayCount = queueRows.length;
  const queueNumber = `${prefix}${String(todayCount + 1).padStart(3, '0')}`;
  const receiptNumber = `NB${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
  const method = payload.method === 'QRIS' ? 'QRIS' : 'Tunai';
  const saleRows = await db('sales', {method: 'POST', body: JSON.stringify({receipt_number: receiptNumber, items: safeItems, subtotal, tax_amount: taxAmount, total, payment_method: method, payment_status: 'paid'})});
  const queueRowsCreated = await db('queue_items', {method: 'POST', body: JSON.stringify({queue_number: queueNumber, queue_date: jakartaToday, item_count: safeItems.reduce((sum, item) => sum + item.qty, 0), sale_id: saleRows[0].id})});
  return {sale: saleRows[0], queue: queueRowsCreated[0], taxPercent};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/health') return send(res, 200, {ok: true, databaseConfigured: Boolean(supabaseUrl && supabaseKey)});
    if (url.pathname === '/api/bootstrap' && req.method === 'GET') return send(res, 200, await bootstrap());
    if (url.pathname === '/api/sales' && req.method === 'POST') return send(res, 201, await createSale(await readBody(req)));
    if (url.pathname === '/api/queue' && req.method === 'GET') {
      if (!supabaseUrl || !supabaseKey) return send(res, 200, {queue: [], current: 0});
      const items = await db('queue_items?select=*&status=neq.Selesai&order=created_at.asc');
      const queue = items.map(item => ({id: item.id, n: item.queue_number, name: '', items: `${item.item_count} item`, status: item.status}));
      return send(res, 200, {queue, current: Math.max(0, queue.findIndex(item => item.status === 'Diproses'))});
    }
    if (url.pathname === '/api/queue' && req.method === 'PUT') return send(res, 501, {error: 'Pembaruan antrean online sedang disiapkan'});
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
