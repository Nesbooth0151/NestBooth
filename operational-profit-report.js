// Laporan biaya operasional dan laba bersih untuk Admin.
(() => {
  if (!/\.onrender\.com$/i.test(location.hostname)) return;
  try {
    const session = JSON.parse(localStorage.getItem('nesbooth-pos-session') || 'null');
    if (session?.role !== 'admin') return;
  } catch { return; }
  const page = document.getElementById('laporan');
  if (!page) return;

  const panel = document.createElement('section');
  panel.id = 'operationalProfitReport';
  panel.className = 'card section';
  panel.style.marginTop = '18px';
  page.appendChild(panel);
  const money = value => 'Rp' + Number(value || 0).toLocaleString('id-ID', {maximumFractionDigits: 2});
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const date = value => new Date(value).toLocaleString('id-ID', {timeZone:'Asia/Jakarta', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
  const period = () => ({from: document.getElementById('reportFrom')?.value, to: document.getElementById('reportTo')?.value});

  async function request(url) {
    const response = await fetch(url, {headers: {'Content-Type':'application/json'}});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Laporan biaya operasional tidak dapat dimuat');
    return data;
  }

  function render(data) {
    const rows = Array.isArray(data.expenses) ? data.expenses : [];
    const shown = rows.filter(row => row.included_in_operational || row.is_deposit);
    const rowMarkup = shown.length ? shown.map(row => {
      const tag = row.is_deposit ? '<span class="badge wait">Setor · tidak dihitung</span>' : '<span class="badge ready">Biaya operasional</span>';
      const material = row.material ? `${safe(row.material.name)}${row.stock_quantity ? ` · +${Number(row.stock_quantity).toLocaleString('id-ID')} ${safe(row.material.unit)}` : ''}` : '—';
      return `<tr><td>${date(row.created_at)}</td><td><b>${safe(row.category)}</b></td><td>${safe(row.description)}</td><td>${material}</td><td>${tag}</td><td style="font-weight:750;color:${row.is_deposit ? '#718096' : '#b54708'}">${row.is_deposit ? '' : '−'}${money(row.amount)}</td></tr>`;
    }).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;padding:20px">Belum ada biaya operasional pada periode ini.</td></tr>';
    const net = Number(data.net_profit || 0);
    panel.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px;align-items:start;flex-wrap:wrap"><div><p style="margin:0 0 4px;font-size:12px;font-weight:800;letter-spacing:.06em;color:#1677ff">LAPORAN OPERASIONAL</p><h2 style="margin:0">Biaya Operasional & Laba Bersih</h2><p class="muted" style="margin:5px 0 0">Laba bersih = laba kotor − biaya operasional. Setor hanya perpindahan kas dan tidak dihitung sebagai biaya.</p></div><button id="reloadOperationalProfit" class="btn ghost" type="button">↻ Muat ulang</button></div><div class="dash-grid" style="margin:16px 0"><div class="card stat"><div class="label">Laba Kotor</div><div class="value">${money(data.gross_profit)}</div><div class="muted">Omzet dikurangi biaya resep</div></div><div class="card stat"><div class="label">Biaya Operasional</div><div class="value" style="color:#b54708">−${money(data.operational_cost)}</div><div class="muted">Termasuk Air dan Es</div></div><div class="card stat"><div class="label">Laba Bersih</div><div class="value" style="color:${net >= 0 ? '#078354' : '#b42318'}">${money(net)}</div><div class="muted">Setelah biaya operasional</div></div></div><h3 style="margin:18px 0 8px">Rincian Biaya Operasional</h3><div style="overflow:auto"><table style="min-width:900px"><thead><tr><th>Waktu</th><th>Kategori</th><th>Keterangan</th><th>Bahan / stok masuk</th><th>Status</th><th>Nominal</th></tr></thead><tbody>${rowMarkup}</tbody></table></div>`;
    panel.querySelector('#reloadOperationalProfit').onclick = load;
  }

  async function load() {
    const {from, to} = period();
    if (!from || !to || from > to) return;
    panel.innerHTML = '<h2>Biaya Operasional & Laba Bersih</h2><p class="muted">Memuat laporan biaya operasional…</p>';
    try {
      const data = await request(`/api/reports/operational?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      render(data);
    } catch (error) {
      panel.innerHTML = `<h2>Biaya Operasional & Laba Bersih</h2><p class="muted">${safe(error.message || 'Laporan biaya operasional tidak dapat dimuat.')}</p>`;
    }
  }

  document.getElementById('applyOnlineReport')?.addEventListener('click', () => setTimeout(load, 0));
  document.querySelector('[data-page="laporan"]')?.addEventListener('click', load);
  window.addEventListener('nesbooth-cloud-updated', load);
  load();
})();
