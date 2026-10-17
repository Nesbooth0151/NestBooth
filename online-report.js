// Laporan penjualan online: seluruh nilai diambil dari database pusat Supabase.
(() => {
  if (!/\.onrender\.com$/i.test(location.hostname)) return;
  const page = document.getElementById('laporan');
  if (!page) return;
  const money = value => 'Rp' + Number(value || 0).toLocaleString('id-ID');
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const dateKey = date => {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(date);
    const part = type => parts.find(item => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  const today = dateKey(new Date());
  let lastSales = [];

  page.innerHTML = `<div class="card section"><h2>Laporan Penjualan Online</h2><p class="muted">Seluruh data pada laporan ini diambil dari transaksi tersimpan di database pusat.</p><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:18px 0"><label class="field">Dari tanggal<input id="reportFrom" type="date" value="${today}"></label><label class="field">Sampai tanggal<input id="reportTo" type="date" value="${today}"></label><button id="applyOnlineReport" class="btn" type="button">Tampilkan</button><button id="exportOnlineReport" class="btn ghost" type="button">Ekspor CSV</button></div><div id="onlineReportSummary" class="dash-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin:0 0 18px"></div><h2 style="margin-top:22px">Produk Terlaris</h2><div id="onlineTopProducts" class="muted" style="margin-bottom:18px"></div><div style="overflow:auto"><table><thead><tr><th>No. Struk</th><th>Tanggal & Waktu</th><th>Item</th><th>Pembayaran</th><th>Total</th><th>Status</th><th>Aksi</th></tr></thead><tbody id="onlineReportRows"></tbody></table></div></div>`;

  async function load() {
    const from = document.getElementById('reportFrom').value;
    const to = document.getElementById('reportTo').value;
    if (!from || !to || from > to) { show('Pilih rentang tanggal yang valid.'); return; }
    const button = document.getElementById('applyOnlineReport'); button.disabled = true; button.textContent = 'Memuat...';
    try {
      const response = await fetch(`/api/reports/sales?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Laporan tidak dapat dimuat');
      lastSales = Array.isArray(data.sales) ? data.sales : [];
      render(lastSales);
    } catch (error) { show(error.message || 'Laporan tidak dapat dimuat'); }
    finally { button.disabled = false; button.textContent = 'Tampilkan'; }
  }

  function render(sales) {
    const paidSales = sales.filter(sale => sale.payment_status === 'paid');
    const total = paidSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const cash = paidSales.filter(sale => sale.payment_method === 'Tunai');
    const qris = paidSales.filter(sale => sale.payment_method === 'QRIS');
    const totals = rows => rows.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const productCount = new Map();
    paidSales.forEach(sale => (sale.items || []).forEach(item => {
      const name = String(item.name || '').split(' — ')[0];
      productCount.set(name, (productCount.get(name) || 0) + Number(item.qty || 0));
    }));
    const popular = [...productCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    document.getElementById('onlineReportSummary').innerHTML = `
      <div class="card stat"><div class="label">Total Penjualan</div><div class="value">${money(total)}</div></div>
      <div class="card stat"><div class="label">Jumlah Transaksi Lunas</div><div class="value">${paidSales.length}</div></div>
      <div class="card stat"><div class="label">Tunai</div><div class="value">${money(totals(cash))}</div><div class="muted">${cash.length} transaksi</div></div>
      <div class="card stat"><div class="label">QRIS</div><div class="value">${money(totals(qris))}</div><div class="muted">${qris.length} transaksi</div></div>
      <div class="card stat"><div class="label">Rata-rata Transaksi</div><div class="value">${money(paidSales.length ? total / paidSales.length : 0)}</div></div>`;
    document.getElementById('onlineTopProducts').innerHTML = popular.length ? popular.map(([name, qty], index) => `<b>${index + 1}. ${safe(name)}</b> <span class="muted">— ${qty} terjual</span>`).join('<br>') : 'Belum ada produk terjual pada periode ini.';
    const statusText = status => ({paid: 'Lunas', cancelled: 'Dibatalkan', refunded: 'Refund'}[status] || status);
    const statusClass = status => status === 'paid' ? 'ready' : 'wait';
    document.getElementById('onlineReportRows').innerHTML = sales.length ? sales.map(sale => {
      const active = sale.payment_status === 'paid';
      const actions = active ? `<button class="btn ghost sale-action" data-action="payment_method" data-id="${safe(sale.id)}" type="button">Ubah bayar</button> <button class="btn ghost sale-action" data-action="cancel" data-id="${safe(sale.id)}" type="button">Batalkan</button> <button class="btn ghost sale-action" data-action="refund" data-id="${safe(sale.id)}" type="button">Refund</button>` : '—';
      return `<tr><td>${safe(sale.receipt_number)}</td><td>${new Date(sale.created_at).toLocaleString('id-ID', {timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'})}</td><td>${(sale.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0)} produk</td><td>${safe(sale.payment_method)}</td><td>${money(sale.total)}</td><td><span class="badge ${statusClass(sale.payment_status)}">${statusText(sale.payment_status)}</span></td><td style="white-space:nowrap">${actions}</td></tr>`;
    }).join('') : '<tr><td colspan="7" style="text-align:center;color:#718096;padding:30px">Belum ada transaksi pada periode ini.</td></tr>';
  }

  function exportCsv() {
    if (!lastSales.length) { show('Tidak ada transaksi untuk diekspor.'); return; }
    const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [['No. Struk', 'Tanggal', 'Item', 'Pembayaran', 'Subtotal', 'Pajak', 'Total', 'Status']];
    lastSales.forEach(sale => rows.push([
      sale.receipt_number,
      new Date(sale.created_at).toLocaleString('id-ID', {timeZone: 'Asia/Jakarta'}),
      (sale.items || []).map(item => `${item.qty}x ${item.name}`).join('; '),
      sale.payment_method, sale.subtotal, sale.tax_amount, sale.total, sale.payment_status
    ]));
    const blob = new Blob(['\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\n')], {type: 'text/csv;charset=utf-8'});
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.download = `laporan-nesbooth-${document.getElementById('reportFrom').value}-${document.getElementById('reportTo').value}.csv`;
    link.click(); URL.revokeObjectURL(link.href);
  }

  document.getElementById('applyOnlineReport').onclick = load;
  document.getElementById('exportOnlineReport').onclick = exportCsv;
  document.querySelector('[data-page="laporan"]')?.addEventListener('click', load);
  load();
})();
