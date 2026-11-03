// Peringatan stok dan riwayat pergerakan bahan baku dari database pusat.
(() => {
  if (!/\.onrender\.com$/i.test(location.hostname)) return;
  const host = document.querySelector('#produk .table-card');
  const stockForm = document.getElementById('stockForm');
  if (!host || !stockForm) return;

  const box = document.createElement('section');
  box.id = 'stockAlerts';
  box.style.cssText = 'margin:0 0 18px;padding:15px;border:1px solid #f1d391;background:#fffaf0;border-radius:10px';
  stockForm.insertAdjacentElement('beforebegin', box);

  const history = document.createElement('section');
  history.id = 'stockHistory';
  history.className = 'card section';
  history.style.marginTop = '18px';
  host.appendChild(history);

  const format = value => Number(value || 0).toLocaleString('id-ID', {maximumFractionDigits: 2});
  const state = () => window.nesboothCloudState || {materials: []};
  const threshold = material => Number(material.min_stock ?? material.min ?? 0);
  const materialStock = material => Number(material.stock || 0);
  const refreshAlerts = () => {
    const materials = state().materials || [];
    const low = materials.filter(material => threshold(material) > 0 && materialStock(material) <= threshold(material));
    const rows = low.map(material => {
      const min = threshold(material), stock = materialStock(material);
      const suggestion = Math.max(0, min * 2 - stock);
      return `<tr><td><b>${material.name}</b></td><td>${format(stock)} ${material.unit}</td><td>${format(min)} ${material.unit}</td><td><b style="color:#b54708">+${format(suggestion)} ${material.unit}</b></td></tr>`;
    }).join('');
    const options = materials.map((material, index) => `<option value="${index}">${material.name}</option>`).join('');
    box.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><h2 style="margin:0;font-size:16px">⚠ Peringatan Stok</h2><p class="muted" style="margin:4px 0 0">Restok disarankan hingga dua kali stok minimum.</p></div><span class="badge ${low.length ? 'wait' : 'ready'}">${low.length ? `${low.length} bahan perlu restok` : 'Stok aman'}</span></div><div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin-top:13px"><label style="display:grid;gap:4px;font-weight:650;font-size:12px">Batas bahan<select id="minimumMaterial" style="height:34px;border:1px solid #e4eaf1;border-radius:7px;padding:0 8px;min-width:170px">${options}</select></label><label style="display:grid;gap:4px;font-weight:650;font-size:12px">Stok minimum<input id="minimumValue" type="number" min="0" style="height:34px;border:1px solid #e4eaf1;border-radius:7px;padding:0 8px;width:120px"></label><button id="saveMinimum" class="btn" type="button">Simpan batas</button></div>${low.length ? `<table style="margin-top:12px"><tr><th>Bahan</th><th>Saat ini</th><th>Minimum</th><th>Rekomendasi</th></tr>${rows}</table>` : '<p class="muted" style="margin:12px 0 0">Tidak ada bahan yang berada di bawah batas minimum.</p>'}`;
    const select = document.getElementById('minimumMaterial');
    const input = document.getElementById('minimumValue');
    const setValue = () => { input.value = threshold(materials[Number(select.value)]); };
    select.addEventListener('change', setValue); setValue();
    document.getElementById('saveMinimum').addEventListener('click', async () => {
      const material = materials[Number(select.value)], minimum = Number(input.value);
      if (!material || !Number.isFinite(minimum) || minimum < 0) return show('Batas stok minimum tidak valid.');
      const button = document.getElementById('saveMinimum'); button.disabled = true; button.textContent = 'Menyimpan...';
      try {
        const response = await fetch(`/api/materials?id=${encodeURIComponent(material.id)}`, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: material.name, unit: material.unit, stock: materialStock(material), min_stock: minimum, unit_cost: Number(material.unit_cost || 0)})});
        const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Batas stok tidak dapat disimpan');
        await window.nesboothCloudReload?.(); refreshAlerts(); show(`Batas minimum ${material.name} disimpan.`);
      } catch (error) { show(error.message || 'Batas stok tidak dapat disimpan.'); }
      finally { button.disabled = false; button.textContent = 'Simpan batas'; }
    });
  };

  const loadHistory = async () => {
    try {
      const response = await fetch('/api/stock/history?limit=100', {headers: {'Content-Type': 'application/json'}});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Riwayat stok tidak dapat dimuat');
      const rows = (data.movements || []).map(row => {
        const incoming = row.movement_type === 'in' || row.movement_type === 'return';
        const label = row.movement_type === 'in' ? 'Stok masuk' : row.movement_type === 'return' ? 'Pengembalian' : 'Terpakai';
        const time = new Date(row.created_at).toLocaleString('id-ID', {timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'});
        return `<tr><td>${time}</td><td><b>${row.material_name}</b></td><td><span class="badge ${incoming ? 'ready' : 'wait'}">${label}</span></td><td style="font-weight:750;color:${incoming ? '#078354' : '#b54708'}">${incoming ? '+' : '−'}${format(row.quantity)} ${row.unit}</td><td class="muted">${row.note || '—'}</td></tr>`;
      }).join('');
      history.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><h2 style="margin:0">Riwayat Stok</h2><p class="muted" style="margin:4px 0 0">Stok masuk, pemakaian resep, dan pengembalian transaksi.</p></div><button id="reloadStockHistory" class="btn ghost" type="button">Muat ulang</button></div><div style="overflow:auto"><table style="min-width:720px;margin-top:10px"><tr><th>Waktu</th><th>Bahan</th><th>Aktivitas</th><th>Perubahan</th><th>Keterangan</th></tr>${rows || '<tr><td colspan="5" class="muted" style="text-align:center;padding:18px">Belum ada riwayat stok.</td></tr>'}</table></div>`;
      document.getElementById('reloadStockHistory')?.addEventListener('click', async () => {
        await window.nesboothCloudReload?.(); refreshAlerts(); loadHistory();
      });
    } catch (error) {
      history.innerHTML = `<h2>Riwayat Stok</h2><p class="muted">${error.message || 'Riwayat stok tidak dapat dimuat.'}</p>`;
    }
  };

  const refreshAll = () => { refreshAlerts(); loadHistory(); };
  window.addEventListener('nesbooth-cloud-updated', () => setTimeout(refreshAll, 0));
  const oldRefresh = window.refreshStockAdmin;
  window.refreshStockAdmin = function () { oldRefresh(); refreshAlerts(); };
  refreshAll();
})();
