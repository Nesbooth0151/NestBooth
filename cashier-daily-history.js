// Riwayat transaksi hari ini khusus untuk akun Kasir. Bersifat baca saja.
(() => {
  if (!/\.onrender\.com$/i.test(location.hostname)) return;
  const page = document.getElementById('transaksi');
  if (!page) return;

  const session = () => { try { return JSON.parse(localStorage.getItem('nesbooth-pos-session') || 'null'); } catch { return null; } };
  const money = value => 'Rp' + Number(value || 0).toLocaleString('id-ID');
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const today = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Jakarta', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date());
    const pick = type => parts.find(part => part.type === type)?.value;
    return `${pick('year')}-${pick('month')}-${pick('day')}`;
  };
  const timestamp = value => new Date(value).toLocaleString('id-ID', {timeZone:'Asia/Jakarta', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
  let started = false;

  const style = document.createElement('style');
  style.textContent = `
    .cashier-history{max-width:980px}.cashier-history-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:18px}.cashier-history-head h2{margin:0;color:#172b4d}.cashier-history-head p{margin:5px 0 0}.cashier-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:18px}.cashier-summary .card{padding:14px}.cashier-summary .label{color:#718096;font-size:12px}.cashier-summary .value{font-size:21px;font-weight:800;color:#172b4d;margin-top:5px}.daily-sale-list{display:grid;gap:10px}.daily-sale{border:1px solid #e2eaf2;border-radius:10px;background:#fff;overflow:hidden}.daily-sale summary{display:grid;grid-template-columns:minmax(145px,1fr) minmax(80px,.55fr) auto;gap:10px;align-items:center;padding:13px 15px;cursor:pointer;list-style:none}.daily-sale summary::-webkit-details-marker{display:none}.daily-sale summary::after{content:'Lihat item';font-size:12px;color:#1677ff;font-weight:700}.daily-sale[open] summary{border-bottom:1px solid #e5edf5;background:#f8fbff}.daily-sale-meta{display:grid;gap:3px}.daily-sale-meta small{color:#718096}.daily-sale-method{font-size:12px;color:#456079}.daily-sale-items{padding:12px 15px 14px;background:#fbfdff}.daily-sale-item{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px dashed #dce6ef}.daily-sale-item:last-child{border-bottom:0}.daily-sale-item small{display:block;color:#718096;margin-top:2px}.daily-sale-empty{padding:30px;text-align:center;color:#718096;border:1px dashed #ccd9e6;border-radius:10px;background:#fbfdff}@media(max-width:620px){.cashier-summary{grid-template-columns:1fr}.daily-sale summary{grid-template-columns:1fr auto}.daily-sale summary::after{grid-column:1/-1}.daily-sale-method{grid-column:1}.daily-sale-items{padding:10px}.daily-sale-item{font-size:13px}}
  `;
  document.head.appendChild(style);

  function render(sales) {
    const paid = sales.filter(sale => sale.payment_status === 'paid');
    const total = paid.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const transfer = paid.filter(sale => sale.payment_method === 'Transfer');
    const receipt = sale => {
      const items = Array.isArray(sale.items) ? sale.items : [];
      const itemRows = items.length ? items.map(item => {
        const parts = String(item.name || '').split(' — ');
        const name = parts.shift();
        return `<div class="daily-sale-item"><div><b>${Number(item.qty || 0)}× ${safe(name)}</b>${parts.length ? `<small>${safe(parts.join(' — '))}</small>` : ''}</div><b>${money(Number(item.price || 0) * Number(item.qty || 0))}</b></div>`;
      }).join('') : '<div class="muted">Rincian item tidak tersedia.</div>';
      const state = sale.payment_status === 'paid' ? 'Lunas' : sale.payment_status;
      return `<details class="daily-sale"><summary><span class="daily-sale-meta"><b>${safe(sale.receipt_number || '—')}</b><small>${timestamp(sale.created_at)}</small></span><span class="daily-sale-method">${safe(sale.payment_method || '—')} · ${safe(state)}</span><b>${money(sale.total)}</b></summary><div class="daily-sale-items">${itemRows}</div></details>`;
    };
    page.innerHTML = `<div class="card section cashier-history"><div class="cashier-history-head"><div><h2>Riwayat Transaksi Hari Ini</h2><p class="muted">Tekan setiap bon untuk melihat item yang terjual.</p></div><button id="reloadCashierDailyHistory" class="btn ghost" type="button">↻ Muat ulang</button></div><div class="cashier-summary"><div class="card"><div class="label">Transaksi Lunas</div><div class="value">${paid.length}</div></div><div class="card"><div class="label">Total Penjualan</div><div class="value">${money(total)}</div></div><div class="card"><div class="label">Transfer Manual</div><div class="value">${transfer.length}</div></div></div><div class="daily-sale-list">${sales.length ? sales.map(receipt).join('') : '<div class="daily-sale-empty">Belum ada transaksi hari ini.</div>'}</div></div>`;
    page.querySelector('#reloadCashierDailyHistory').onclick = load;
  }

  async function load() {
    const button = page.querySelector('#reloadCashierDailyHistory');
    if (button) { button.disabled = true; button.textContent = 'Memuat…'; }
    try {
      const date = today();
      const response = await fetch(`/api/reports/sales?from=${date}&to=${date}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Riwayat transaksi tidak dapat dimuat');
      render(Array.isArray(data.sales) ? data.sales : []);
    } catch (error) {
      page.innerHTML = `<div class="card section cashier-history"><h2>Riwayat Transaksi Hari Ini</h2><p class="muted">${safe(error.message || 'Riwayat transaksi tidak dapat dimuat.')}</p><button id="reloadCashierDailyHistory" class="btn ghost" type="button">Coba lagi</button></div>`;
      page.querySelector('#reloadCashierDailyHistory').onclick = load;
    }
  }

  function start(activeSession = session()) {
    if (started || activeSession?.role !== 'kasir') return;
    started = true;
    load();
    document.querySelector('[data-page="transaksi"]')?.addEventListener('click', load);
  }
  document.addEventListener('pos-session-ready', event => start(event.detail));
  start();
})();
