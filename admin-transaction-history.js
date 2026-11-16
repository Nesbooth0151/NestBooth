// Riwayat transaksi Admin: seluruh bon hingga enam bulan terakhir.
(() => {
  if (!/\.onrender\.com$/i.test(location.hostname)) return;
  const page = document.getElementById('transaksi');
  if (!page) return;

  const session = () => { try { return JSON.parse(localStorage.getItem('nesbooth-pos-session') || 'null'); } catch { return null; } };
  const money = value => 'Rp' + Number(value || 0).toLocaleString('id-ID');
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const timestamp = value => new Date(value).toLocaleString('id-ID', {timeZone:'Asia/Jakarta', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
  const dateKey = value => {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Jakarta', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(value);
    const part = type => parts.find(item => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  };

  const today = dateKey(new Date());
  const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const earliest = dateKey(sixMonthsAgo);
  let started = false;

  function receipt(sale) {
    const items = Array.isArray(sale.items) ? sale.items : [];
    const itemRows = items.length ? items.map(item => {
      const parts = String(item.name || '').split(' — ');
      const name = parts.shift();
      return `<div class="daily-sale-item"><div><b>${Number(item.qty || 0)}× ${safe(name)}</b>${parts.length ? `<small>${safe(parts.join(' — '))}</small>` : ''}</div><b>${money(Number(item.price || 0) * Number(item.qty || 0))}</b></div>`;
    }).join('') : '<div class="muted">Rincian item tidak tersedia.</div>';
    const status = sale.payment_status === 'paid' ? 'Lunas' : sale.payment_status;
    return `<details class="daily-sale"><summary><span class="daily-sale-meta"><b>${safe(sale.receipt_number || '—')}</b><small>${timestamp(sale.created_at)}</small></span><span class="daily-sale-method">${safe(sale.payment_method || '—')} · ${safe(status)}</span><b>${money(sale.total)}</b></summary><div class="daily-sale-items">${itemRows}</div></details>`;
  }

  function render(sales) {
    const paid = sales.filter(sale => sale.payment_status === 'paid');
    const total = paid.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const transfer = paid.filter(sale => sale.payment_method === 'Transfer');
    page.innerHTML = `<div class="card section cashier-history"><div class="cashier-history-head"><div><h2>Riwayat Transaksi</h2><p class="muted">Semua transaksi hingga enam bulan terakhir. Tekan setiap bon untuk melihat item yang terjual.</p></div><button id="reloadAdminHistory" class="btn ghost" type="button">↻ Muat ulang</button></div><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:0 0 18px"><label class="field">Dari tanggal<input id="adminHistoryFrom" type="date" min="${earliest}" max="${today}" value="${document.getElementById('adminHistoryFrom')?.value || earliest}"></label><label class="field">Sampai tanggal<input id="adminHistoryTo" type="date" min="${earliest}" max="${today}" value="${document.getElementById('adminHistoryTo')?.value || today}"></label><button id="applyAdminHistory" class="btn" type="button">Tampilkan</button></div><div class="cashier-summary"><div class="card"><div class="label">Transaksi Lunas</div><div class="value">${paid.length}</div></div><div class="card"><div class="label">Total Penjualan</div><div class="value">${money(total)}</div></div><div class="card"><div class="label">Transfer Manual</div><div class="value">${money(transfer.reduce((sum, sale) => sum + Number(sale.total || 0), 0))}</div></div></div><div class="daily-sale-list">${sales.length ? sales.map(receipt).join('') : '<div class="daily-sale-empty">Belum ada transaksi pada periode ini.</div>'}</div></div>`;
    page.querySelector('#applyAdminHistory').onclick = load;
    page.querySelector('#reloadAdminHistory').onclick = load;
  }

  async function load() {
    const from = document.getElementById('adminHistoryFrom')?.value || earliest;
    const to = document.getElementById('adminHistoryTo')?.value || today;
    if (!from || !to || from > to || from < earliest || to > today) return window.show?.('Pilih rentang tanggal maksimal enam bulan terakhir.');
    const button = document.getElementById('applyAdminHistory') || document.getElementById('reloadAdminHistory');
    if (button) { button.disabled = true; button.textContent = 'Memuat…'; }
    try {
      const response = await fetch(`/api/reports/sales?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Riwayat transaksi tidak dapat dimuat');
      render(Array.isArray(data.sales) ? data.sales : []);
    } catch (error) {
      page.innerHTML = `<div class="card section cashier-history"><h2>Riwayat Transaksi</h2><p class="muted">${safe(error.message || 'Riwayat transaksi tidak dapat dimuat.')}</p><button id="reloadAdminHistory" class="btn ghost" type="button">Coba lagi</button></div>`;
      page.querySelector('#reloadAdminHistory').onclick = load;
    }
  }

  function start(activeSession = session()) {
    if (started || activeSession?.role !== 'admin') return;
    started = true;
    load();
    document.querySelector('[data-page="transaksi"]')?.addEventListener('click', load);
  }
  document.addEventListener('pos-session-ready', event => start(event.detail));
  start();
})();
