// Riwayat transaksi di Render selalu mengambil database pusat.
(() => {
  const page = document.getElementById('transaksi');
  if (!page) return;
  const online = /\.onrender\.com$/i.test(location.hostname);
  const money = value => 'Rp' + Number(value || 0).toLocaleString('id-ID');
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const jakartaDate = date => {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const get = type => parts.find(part => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  const today = jakartaDate(new Date());
  const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const startDate = jakartaDate(sixMonthsAgo);
  page.innerHTML = `<div class="card table-card"><h2>Riwayat Transaksi</h2><p class="muted">Transaksi tersimpan dari enam bulan terakhir.</p><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:18px 0"><label class="field">Dari tanggal<input id="historyFrom" type="date" min="${startDate}" max="${today}" value="${startDate}"></label><label class="field">Sampai tanggal<input id="historyTo" type="date" min="${startDate}" max="${today}" value="${today}"></label><button id="applyHistory" class="btn" type="button">Tampilkan</button></div><div id="historySummary" class="dash-grid" style="margin:0 0 18px"></div><table><thead><tr><th>No. Struk</th><th>Tanggal & Waktu</th><th>Item</th><th>Pembayaran</th><th>Total</th><th>Status</th></tr></thead><tbody id="transactions"></tbody></table></div>`;
  const localSales = () => { try { return JSON.parse(localStorage.getItem('nestbooth-sales-history')) || []; } catch { return []; } };
  function render(sales) {
    const paid = sales.filter(sale => (sale.payment_status || 'paid') === 'paid');
    const total = paid.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    document.getElementById('historySummary').innerHTML = `<div class="card stat"><div class="label">Total Penjualan</div><div class="value">${money(total)}</div></div><div class="card stat"><div class="label">Jumlah Transaksi</div><div class="value">${paid.length}</div></div><div class="card stat"><div class="label">Rata-rata Transaksi</div><div class="value">${money(paid.length ? total / paid.length : 0)}</div></div>`;
    document.getElementById('transactions').innerHTML = sales.length ? sales.map(sale => {
      const status = sale.payment_status || 'paid';
      return `<tr><td>${safe(sale.receipt_number || sale.receiptNumber)}</td><td>${new Date(sale.created_at || sale.timestamp).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</td><td>${(sale.items || []).reduce((sum,item) => sum + Number(item.qty || 0), 0)} produk</td><td>${safe(sale.payment_method || sale.method)}</td><td>${money(sale.total)}</td><td><span class="badge ${status === 'paid' ? 'ready' : 'wait'}">${status === 'paid' ? 'Lunas' : safe(status)}</span></td></tr>`;
    }).join('') : '<tr><td colspan="6" style="text-align:center;color:#718096;padding:30px">Belum ada transaksi pada periode ini.</td></tr>';
  }
  async function load() {
    const from = document.getElementById('historyFrom').value, to = document.getElementById('historyTo').value;
    if (!from || !to || from > to) return window.show?.('Pilih rentang tanggal yang valid.');
    const button = document.getElementById('applyHistory'); button.disabled = true; button.textContent = 'Memuat...';
    try {
      if (online) {
        const response = await fetch(`/api/reports/sales?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Riwayat tidak dapat dimuat');
        render(Array.isArray(data.sales) ? data.sales : []);
      } else {
        const start = new Date(`${from}T00:00:00`), end = new Date(`${to}T23:59:59`);
        render(localSales().filter(sale => { const date = new Date(sale.timestamp); return date >= start && date <= end; }));
      }
    } catch (error) { window.show?.(error.message || 'Riwayat tidak dapat dimuat'); render([]); }
    finally { button.disabled = false; button.textContent = 'Tampilkan'; }
  }
  document.getElementById('applyHistory').onclick = load;
  document.querySelector('[data-page="transaksi"]')?.addEventListener('click', load);
  load();
})();
