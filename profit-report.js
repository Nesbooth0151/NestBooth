// Laba per produk dihitung dari harga jual pada transaksi dan biaya bahan pada resep.
(() => {
  if (!/\.onrender\.com$/i.test(location.hostname)) return;
  // Endpoint laba mengandung biaya bahan dan hanya boleh dimuat oleh Admin.
  try {
    const session = JSON.parse(localStorage.getItem('nesbooth-pos-session') || 'null');
    if (session?.role !== 'admin') return;
  } catch { return; }
  const page = document.getElementById('laporan');
  if (!page) return;
  const money = value => 'Rp' + Number(value || 0).toLocaleString('id-ID', {maximumFractionDigits: 2});
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const panel = document.createElement('section'); panel.id = 'productProfitReport'; panel.className = 'card section'; panel.style.marginTop = '18px';
  panel.innerHTML = '<h2>Laporan Laba per Produk</h2><p class="muted">Memuat laporan laba…</p>';
  page.appendChild(panel);

  const request = async (url, options = {}) => {
    const response = await fetch(url, {headers:{'Content-Type':'application/json'}, ...options});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Laporan laba tidak dapat dimuat');
    return data;
  };
  const period = () => ({from: document.getElementById('reportFrom')?.value, to: document.getElementById('reportTo')?.value});
  const materials = () => window.nesboothCloudState?.materials || [];

  function costsMarkup() {
    const list = materials();
    if (!list.length) return '<p class="muted">Bahan baku akan muncul setelah data stok tersambung.</p>';
    return `<details style="margin-top:16px"><summary style="cursor:pointer;font-weight:750">Atur biaya bahan per satuan</summary><p class="muted" style="margin:8px 0">Isi harga beli per gram, ml, atau pcs. Contoh: bahan kemasan Rp2.000 per sachet → isi 2000.</p><form id="materialCostForm"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px">${list.map(material => `<label style="display:grid;gap:4px;font-size:13px;font-weight:650">${safe(material.name)} <small class="muted">per ${safe(material.unit)}</small><input class="material-cost" data-id="${material.id}" type="number" min="0" step="0.01" value="${Number(material.unit_cost || 0)}"></label>`).join('')}</div><button class="btn" type="submit" style="margin-top:12px">Simpan Biaya Bahan</button></form></details>`;
  }
  function render(rows) {
    const revenue = rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
    const cost = rows.reduce((sum, row) => sum + Number(row.ingredient_cost || 0), 0);
    const profit = revenue - cost;
    panel.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;align-items:start;flex-wrap:wrap"><div><h2 style="margin:0">Laba per Produk</h2><p class="muted" style="margin:5px 0 0">Laba kotor = omzet dikurangi biaya bahan menurut resep.</p></div><button id="reloadProductProfit" class="btn ghost" type="button">Muat ulang</button></div><div class="dash-grid" style="margin:16px 0"><div class="card stat"><div class="label">Omzet Produk</div><div class="value">${money(revenue)}</div></div><div class="card stat"><div class="label">Biaya Bahan</div><div class="value">${money(cost)}</div></div><div class="card stat"><div class="label">Laba Kotor</div><div class="value" style="color:${profit >= 0 ? '#078354' : '#b42318'}">${money(profit)}</div></div></div><div style="overflow:auto"><table style="min-width:760px"><thead><tr><th>Produk</th><th>Terjual</th><th>Omzet</th><th>Biaya Bahan</th><th>Laba Kotor</th><th>Margin</th><th>Resep</th></tr></thead><tbody>${rows.length ? rows.map(row => `<tr><td><b>${safe(row.product_name)}</b></td><td>${Number(row.quantity || 0).toLocaleString('id-ID')}</td><td>${money(row.revenue)}</td><td>${money(row.ingredient_cost)}</td><td style="font-weight:750;color:${Number(row.gross_profit) >= 0 ? '#078354' : '#b42318'}">${money(row.gross_profit)}</td><td>${Number(row.margin_percent || 0).toLocaleString('id-ID')}%</td><td><span class="badge ${row.recipe_complete ? 'ready' : 'wait'}">${row.recipe_complete ? 'Lengkap' : 'Belum lengkap'}</span></td></tr>`).join('') : '<tr><td colspan="7" class="muted" style="text-align:center;padding:20px">Belum ada transaksi lunas pada periode ini.</td></tr>'}</tbody></table></div>${costsMarkup()}`;
    panel.querySelector('#reloadProductProfit').onclick = load;
    panel.querySelector('#materialCostForm')?.addEventListener('submit', saveCosts);
  }
  async function saveCosts(event) {
    event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true; button.textContent = 'Menyimpan…';
    try {
      const inputs = [...event.target.querySelectorAll('.material-cost')];
      await Promise.all(inputs.map(input => request('/api/materials/cost', {method:'PUT', body:JSON.stringify({material_id:input.dataset.id, unit_cost:Number(input.value)})})));
      await window.nesboothCloudReload?.(); show('Biaya bahan tersimpan.'); await load();
    } catch (error) { show(error.message || 'Biaya bahan tidak dapat disimpan.'); }
    finally { button.disabled = false; button.textContent = 'Simpan Biaya Bahan'; }
  }
  async function load() {
    const {from, to} = period();
    if (!from || !to || from > to) return;
    panel.innerHTML = '<h2>Laba per Produk</h2><p class="muted">Memuat laporan laba…</p>';
    try { const data = await request(`/api/reports/profit?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`); render(Array.isArray(data.products) ? data.products : []); }
    catch (error) { panel.innerHTML = `<h2>Laba per Produk</h2><p class="muted">${safe(error.message || 'Laporan laba tidak dapat dimuat.')}</p>`; }
  }
  document.getElementById('applyOnlineReport')?.addEventListener('click', () => setTimeout(load, 0));
  document.querySelector('[data-page="laporan"]')?.addEventListener('click', load);
  window.addEventListener('nesbooth-cloud-updated', () => { if (!panel.querySelector('#materialCostForm')) load(); });
  load();
})();
