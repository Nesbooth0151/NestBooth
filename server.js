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
const midtransApiBase = midtransProduction ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
// Sesi disimpan di server, bukan dipercaya dari role di browser.
// Server Render dapat direstart; pada kondisi itu pengguna cukup login kembali.
const posSessions = new Map();
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

class HttpError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  posSessions.set(token, {id: user.id, name: user.name, role: user.role, expiresAt});
  return {token, expiresAt};
}

function requireSession(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  const session = match && posSessions.get(match[1]);
  if (!session || session.expiresAt <= Date.now()) {
    if (match) posSessions.delete(match[1]);
    throw new HttpError(401, 'Sesi login tidak valid atau telah berakhir. Silakan masuk kembali.');
  }
  return session;
}

function requireRole(req, roles) {
  const session = requireSession(req);
  if (!roles.includes(session.role)) throw new HttpError(403, 'Akses ditolak untuk peran pengguna ini');
  return session;
}

function apiRoles(pathname, method) {
  if (pathname === '/api/bootstrap' && method === 'GET') return ['admin', 'kasir'];
  if (pathname === '/api/queue') return ['admin', 'kasir', 'bar'];
  if (pathname === '/api/sales' && method === 'POST') return ['admin', 'kasir'];
  if (pathname === '/api/sales/manage') return ['admin'];
  if (pathname === '/api/midtrans/config' || pathname === '/api/midtrans/payment' || pathname === '/api/midtrans/status') return ['admin', 'kasir'];
  if (pathname === '/api/reports/sales' || pathname === '/api/reports/profit' || pathname === '/api/users') return ['admin'];
  if (pathname === '/api/settings' || pathname === '/api/products' || pathname === '/api/materials' || pathname === '/api/materials/cost' || pathname === '/api/stock/history' || pathname === '/api/recipes') return ['admin'];
  if (pathname === '/api/shifts' || pathname === '/api/shifts/detail') return ['admin', 'kasir'];
  if (pathname === '/api/shifts/open' || pathname === '/api/shifts/close') return ['admin', 'kasir'];
  if (pathname === '/api/cash-expenses') return ['admin', 'kasir'];
  return [];
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

async function loginPosUser(payload) {
  const role = String(payload.role || '').toLowerCase();
  const pin = String(payload.pin || '');
  if (!['admin', 'kasir', 'bar'].includes(role) || !/^\d{4,6}$/.test(pin)) throw new Error('Pilih peran dan masukkan PIN 4–6 digit');
  const rows = await db('rpc/login_pos_user', {method: 'POST', body: JSON.stringify({p_role: role, p_pin: pin})});
  if (!rows?.[0]) throw new Error('PIN tidak sesuai atau akun tidak aktif');
  const name = rows[0].user_name;
  const users = await db(`pos_users?select=id,name,role&role=eq.${encodeURIComponent(role)}&name=eq.${encodeURIComponent(name)}&is_active=eq.true&limit=1`);
  if (!users?.[0]) throw new Error('Akun pengguna tidak ditemukan');
  const session = createSession(users[0]);
  return {name: users[0].name, role: users[0].role, token: session.token, expiresAt: session.expiresAt};
}

async function listPosUsers() {
  const [users, activities] = await Promise.all([
    db('pos_users?select=id,name,role,is_active,created_at,updated_at&order=created_at.asc'),
    db('user_activity_logs?select=id,actor_name,action,details,created_at&order=created_at.desc&limit=40')
  ]);
  return {users, activities};
}

async function managePosUser(payload, session) {
  if (session.role !== 'admin') throw new HttpError(403, 'Hanya Admin yang dapat mengelola pengguna');
  const action = String(payload.action || '').toLowerCase();
  const actor = session.name;
  const userId = payload.user_id ? String(payload.user_id) : null;
  if (userId && !/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('ID pengguna tidak valid');
  if (!['create', 'change_pin', 'set_active'].includes(action)) throw new Error('Aksi pengguna tidak valid');
  const result = await db('rpc/manage_pos_user', {method: 'POST', body: JSON.stringify({
    p_action: action, p_actor: actor, p_user_id: userId,
    p_name: action === 'create' ? cleanName(payload.name, 'Nama pengguna') : null,
    p_role: action === 'create' ? String(payload.role || '').toLowerCase() : null,
    p_pin: payload.pin ? String(payload.pin) : null,
    p_is_active: action === 'set_active' ? Boolean(payload.is_active) : null
  })});
  return result;
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
  // Awalan A lama dihilangkan agar antrean tampil 001, 002, dan seterusnya.
  const storedPrefix = String(settingsRows[0]?.queue_prefix ?? '').trim().toUpperCase();
  const prefix = storedPrefix === 'A' ? '' : storedPrefix;
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

async function midtransGetStatus(orderId) {
  const response = await fetch(`${midtransApiBase}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: {Authorization: `Basic ${Buffer.from(`${midtransServerKey}:`).toString('base64')}`, Accept: 'application/json'}
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_messages?.[0] || data.status_message || 'Status pembayaran Midtrans tidak dapat diperiksa');
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

async function applyMidtransStatus(payload) {
  const orderId = String(payload.order_id || '');
  if (!orderId) throw new Error('Order Midtrans tidak valid');
  const orders = await db(`payment_orders?order_id=eq.${encodeURIComponent(orderId)}&select=*`);
  const order = orders[0];
  // Midtrans Dashboard mengirim Order ID contoh ketika tombol "Test
  // notification URL" dipakai. Setelah signature diverifikasi, respons 200
  // cukup untuk membuktikan endpoint aktif; tidak boleh membuat sale baru.
  if (!order) return {ok: true, ignored: true};
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

async function handleMidtransNotification(payload) {
  ensureMidtransConfigured();
  // Tombol "Test notification URL" membuat Order ID sintetis di Dashboard.
  // Notifikasi ini tidak pernah menyentuh pesanan POS dan aman diakui agar
  // Dashboard dapat memverifikasi URL tanpa memerlukan transaksi nyata.
  if (String(payload.order_id || '').startsWith('payment_notif_test_')) return {ok: true, ignored: true};
  if (!isMidtransSignatureValid(payload)) {
    // Konfirmasi langsung ke Midtrans bila signature notifikasi tidak sesuai
    // dengan Server Key aktif. Ini tetap aman karena status API memakai Basic
    // Auth Server Key dan nilai order serta total harus identik.
    const verified = await midtransGetStatus(String(payload.order_id || ''));
    const sameOrder = String(verified.order_id || '') === String(payload.order_id || '');
    const sameAmount = Number(verified.gross_amount) === Number(payload.gross_amount);
    if (!sameOrder || !sameAmount) throw new Error('Notifikasi Midtrans tidak dapat diverifikasi');
    return applyMidtransStatus(verified);
  }
  return applyMidtransStatus(payload);
}

async function midtransPaymentStatus(url) {
  const orderId = String(url.searchParams.get('order_id') || '');
  if (!/^NB-[0-9]+-[0-9a-f]+$/i.test(orderId)) throw new Error('Order pembayaran tidak valid');
  let rows = await db(`payment_orders?order_id=eq.${encodeURIComponent(orderId)}&select=*`);
  let order = rows[0];
  if (!order) throw new Error('Order pembayaran tidak ditemukan');
  // Bila webhook belum sampai, periksa langsung ke Midtrans sekali. Ini juga
  // menyelaraskan pembayaran Sandbox yang sudah sukses saat tab kasir tertutup.
  if (!order.midtrans_status || url.searchParams.get('verify') === '1') {
    const gatewayStatus = await midtransGetStatus(orderId);
    if (String(gatewayStatus.order_id || '') !== orderId) throw new Error('Status Midtrans tidak cocok');
    await applyMidtransStatus(gatewayStatus);
    rows = await db(`payment_orders?order_id=eq.${encodeURIComponent(orderId)}&select=*`);
    order = rows[0];
  }
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

async function manageSale(payload, session) {
  const id = String(payload.id || '');
  const action = String(payload.action || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Transaksi tidak valid');
  if (!['cancel', 'refund', 'payment_method'].includes(action)) throw new Error('Aksi transaksi tidak valid');
  const staff = action === 'payment_method' ? null : session.name;
  const reason = action === 'payment_method' ? null : String(payload.reason || '').trim();
  if (reason !== null && (reason.length < 3 || reason.length > 300)) throw new Error('Alasan pembatalan/refund harus 3–300 karakter');
  const result = await db('rpc/manage_pos_sale', {method: 'POST', body: JSON.stringify({
    p_sale_id: id, p_action: action, p_payment_method: payload.payment_method || null,
    p_staff_name: staff, p_reason: reason
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

async function productProfitReport(from, to) {
  const start = reportDate(from, 'Tanggal awal');
  const end = reportDate(to, 'Tanggal akhir');
  if (start > end) throw new Error('Rentang tanggal tidak valid');
  return db('rpc/product_profit_report', {method: 'POST', body: JSON.stringify({p_from: start, p_to: end})});
}

async function saveSettings(payload) {
  const store_name = cleanName(payload.store_name, 'Nama toko');
  const tax_percent = 0;
  const queue_prefix = String(payload.queue_prefix ?? '').trim().toUpperCase().slice(0, 4);
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
  if (payload.unit_cost !== undefined && payload.unit_cost !== null) {
    const unit_cost = Number(payload.unit_cost);
    if (!Number.isFinite(unit_cost) || unit_cost < 0) throw new Error('Biaya bahan tidak valid');
    body.unit_cost = unit_cost;
  }
  if (!id) return (await db('materials', {method: 'POST', body: JSON.stringify(body)}))[0];
  return (await db(`materials?id=eq.${encodeURIComponent(id)}`, {method: 'PATCH', body: JSON.stringify(body)}))[0];
}

async function saveMaterialCost(payload) {
  const id = String(payload.material_id || ''), unit_cost = Number(payload.unit_cost);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isFinite(unit_cost) || unit_cost < 0) throw new Error('Biaya bahan tidak valid');
  const rows = await db(`materials?id=eq.${encodeURIComponent(id)}`, {method: 'PATCH', body: JSON.stringify({unit_cost})});
  if (!rows?.[0]) throw new Error('Bahan baku tidak ditemukan');
  return rows[0];
}

async function restockMaterial(payload) {
  const material_id = String(payload.material_id || '');
  const quantity = Number(payload.quantity);
  const note = String(payload.note || '').trim().slice(0, 160);
  if (!/^[0-9a-f-]{36}$/i.test(material_id) || !Number.isFinite(quantity) || quantity <= 0) throw new Error('Data restok tidak valid');
  const rows = await db('rpc/restock_material', {method: 'POST', body: JSON.stringify({p_material_id: material_id, p_quantity: quantity, p_note: note})});
  return rows;
}

async function stockHistory(url) {
  const limit = Math.min(300, Math.max(1, Number(url.searchParams.get('limit')) || 100));
  return db('rpc/get_stock_history', {method: 'POST', body: JSON.stringify({p_limit: limit})});
}

async function shiftStatus() {
  const open = (await db('cashier_shifts?status=eq.open&select=*&limit=1'))[0] || null;
  let summary = null;
  if (open) {
    const [sales, expenses, materials] = await Promise.all([
      db(`sales?shift_id=eq.${encodeURIComponent(open.id)}&payment_status=eq.paid&select=total,payment_method`),
      db(`cash_expenses?shift_id=eq.${encodeURIComponent(open.id)}&select=*&order=created_at.desc`),
      db('materials?select=id,name,unit')
    ]);
    const cash_sales = sales.filter(sale => sale.payment_method === 'Tunai').reduce((total, sale) => total + Number(sale.total || 0), 0);
    const qris_sales = sales.filter(sale => sale.payment_method === 'QRIS').reduce((total, sale) => total + Number(sale.total || 0), 0);
    const cash_expenses = expenses.reduce((total, expense) => total + Number(expense.amount || 0), 0);
    const materialMap = new Map(materials.map(material => [material.id, material]));
    summary = {...open, cash_sales, qris_sales, cash_expenses, expenses: expenses.map(expense => ({...expense, material: materialMap.get(expense.material_id) || null})), expected_cash: Number(open.opening_cash) + cash_sales - cash_expenses, transaction_count: sales.length};
  }
  const recent = await db('cashier_shifts?status=eq.closed&select=*&order=closed_at.desc&limit=12');
  return {openShift: summary, recent};
}

async function shiftDetail(url) {
  const id = String(url.searchParams.get('id') || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Shift tidak valid');
  const [shiftRows, sales, expenses, materials] = await Promise.all([
    db(`cashier_shifts?id=eq.${encodeURIComponent(id)}&select=*&limit=1`),
    db(`sales?shift_id=eq.${encodeURIComponent(id)}&select=receipt_number,items,payment_method,payment_status,total,created_at&order=created_at.asc`),
    db(`cash_expenses?shift_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.asc`),
    db('materials?select=id,name,unit')
  ]);
  if (!shiftRows?.[0]) throw new Error('Shift tidak ditemukan');
  const materialMap = new Map(materials.map(material => [material.id, material]));
  return {shift: shiftRows[0], sales, expenses: expenses.map(expense => ({...expense, material: materialMap.get(expense.material_id) || null}))};
}

async function addCashExpense(payload, session) {
  const shift_id = String(payload.shift_id || ''), category = String(payload.category || '').trim(), description = String(payload.description || '').trim();
  const amount = Math.round(Number(payload.amount));
  const material_id = payload.material_id ? String(payload.material_id) : null;
  const stock_quantity = material_id ? Number(payload.stock_quantity) : null;
  if (!/^[0-9a-f-]{36}$/i.test(shift_id) || category.length < 2 || category.length > 80 || description.length < 3 || description.length > 300 || !Number.isFinite(amount) || amount <= 0 || (material_id && (!/^[0-9a-f-]{36}$/i.test(material_id) || !Number.isFinite(stock_quantity) || stock_quantity <= 0))) throw new Error('Data pengeluaran kas tidak valid');
  return db('rpc/add_pos_cash_expense', {method: 'POST', body: JSON.stringify({p_shift_id: shift_id, p_category: category, p_description: description, p_amount: amount, p_created_by: session.name, p_material_id: material_id, p_stock_quantity: stock_quantity})});
}

async function openShift(payload, session) {
  const cashier = session.name;
  const opening_cash = Math.round(Number(payload.opening_cash));
  if (!Number.isFinite(opening_cash) || opening_cash < 0) throw new Error('Kas awal tidak valid');
  return db('rpc/open_pos_shift', {method: 'POST', body: JSON.stringify({p_cashier_name: cashier, p_opening_cash: opening_cash})});
}

async function closeShift(payload, session) {
  const shift_id = String(payload.shift_id || ''), cashier = session.name;
  const counted_cash = Math.round(Number(payload.counted_cash)), notes = String(payload.notes || '').trim().slice(0, 300);
  if (!/^[0-9a-f-]{36}$/i.test(shift_id) || !Number.isFinite(counted_cash) || counted_cash < 0) throw new Error('Data tutup shift tidak valid');
  return db('rpc/close_pos_shift', {method: 'POST', body: JSON.stringify({p_shift_id: shift_id, p_closed_by: cashier, p_counted_cash: counted_cash, p_notes: notes})});
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/health') return send(res, 200, {ok: true, databaseConfigured: Boolean(supabaseUrl && supabaseKey)});
    if (url.pathname === '/api/auth/login' && req.method === 'POST') return send(res, 200, await loginPosUser(await readBody(req)));
    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i); if (match) posSessions.delete(match[1]);
      return send(res, 200, {ok: true});
    }
    // Midtrans adalah satu-satunya pihak luar yang boleh mengirim webhook;
    // tanda tangannya diverifikasi di handleMidtransNotification().
    const roles = apiRoles(url.pathname, req.method);
    const session = roles.length ? requireRole(req, roles) : null;
    if (url.pathname.startsWith('/api/') && !roles.length && url.pathname !== '/api/midtrans/notification') throw new HttpError(404, 'API tidak ditemukan');
    if (url.pathname === '/api/users' && req.method === 'GET') return send(res, 200, await listPosUsers());
    if (url.pathname === '/api/users' && req.method === 'POST') return send(res, 200, await managePosUser(await readBody(req), session));
    if (url.pathname === '/api/midtrans/config' && req.method === 'GET') return send(res, 200, {configured: Boolean(midtransServerKey && midtransClientKey), clientKey: midtransClientKey || null, snapUrl: `${midtransBase}/snap/snap.js`});
    if (url.pathname === '/api/midtrans/payment' && req.method === 'POST') return send(res, 201, await createMidtransPayment(await readBody(req)));
    if (url.pathname === '/api/midtrans/notification' && req.method === 'POST') return send(res, 200, await handleMidtransNotification(await readBody(req)));
    if (url.pathname === '/api/midtrans/status' && req.method === 'GET') return send(res, 200, await midtransPaymentStatus(url));
    if (url.pathname === '/api/bootstrap' && req.method === 'GET') return send(res, 200, await bootstrap());
    if (url.pathname === '/api/reports/sales' && req.method === 'GET') return send(res, 200, {sales: await salesReport(url.searchParams.get('from'), url.searchParams.get('to'))});
    if (url.pathname === '/api/reports/profit' && req.method === 'GET') return send(res, 200, {products: await productProfitReport(url.searchParams.get('from'), url.searchParams.get('to'))});
    if (url.pathname === '/api/sales' && req.method === 'POST') return send(res, 201, await createSale(await readBody(req)));
    if (url.pathname === '/api/sales/manage' && req.method === 'PUT') return send(res, 200, await manageSale(await readBody(req), session));
    if (url.pathname === '/api/settings' && req.method === 'PUT') return send(res, 200, await saveSettings(await readBody(req)));
    if (url.pathname === '/api/products' && req.method === 'POST') return send(res, 201, await saveProduct(await readBody(req)));
    if (url.pathname === '/api/products' && req.method === 'PUT') return send(res, 200, await saveProduct(await readBody(req), url.searchParams.get('id')));
    if (url.pathname === '/api/products' && req.method === 'DELETE') return send(res, 200, await db(`products?id=eq.${encodeURIComponent(url.searchParams.get('id') || '')}`, {method: 'PATCH', body: JSON.stringify({is_active: false})}));
    if (url.pathname === '/api/materials' && req.method === 'POST') return send(res, 201, await saveMaterial(await readBody(req)));
    if (url.pathname === '/api/materials' && req.method === 'PUT') return send(res, 200, await saveMaterial(await readBody(req), url.searchParams.get('id')));
    if (url.pathname === '/api/materials' && req.method === 'DELETE') return send(res, 200, await db(`materials?id=eq.${encodeURIComponent(url.searchParams.get('id') || '')}`, {method: 'DELETE'}));
    if (url.pathname === '/api/materials/cost' && req.method === 'PUT') return send(res, 200, await saveMaterialCost(await readBody(req)));
    if (url.pathname === '/api/materials/restock' && req.method === 'POST') return send(res, 200, await restockMaterial(await readBody(req)));
    if (url.pathname === '/api/stock/history' && req.method === 'GET') return send(res, 200, {movements: await stockHistory(url)});
    if (url.pathname === '/api/shifts' && req.method === 'GET') return send(res, 200, await shiftStatus());
    if (url.pathname === '/api/shifts/detail' && req.method === 'GET') return send(res, 200, await shiftDetail(url));
    if (url.pathname === '/api/shifts/open' && req.method === 'POST') return send(res, 201, await openShift(await readBody(req), session));
    if (url.pathname === '/api/shifts/close' && req.method === 'POST') return send(res, 200, await closeShift(await readBody(req), session));
    if (url.pathname === '/api/cash-expenses' && req.method === 'POST') return send(res, 201, await addCashExpense(await readBody(req), session));
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
    console.error(`[NesBooth] ${req.method} ${url.pathname}:`, error.stack || error.message || error);
    return send(res, error.statusCode || 500, {error: error.message || 'Terjadi kesalahan server'});
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
