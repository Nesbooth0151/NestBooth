// Tampilan stok baca-saja untuk Kasir. Tidak ada tombol atau API pengubah stok.
(() => {
  if (!/\.onrender\.com$/i.test(location.hostname)) return;
  const root = document.getElementById('cashierStockView');
  if (!root) return;
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number = value => Number(value || 0).toLocaleString('id-ID', {maximumFractionDigits: 2});
  function render() {
    const materials = window.nesboothCloudState?.materials || [];
    const rows = materials.map(material => {
      const stock = Number(material.stock || 0), minimum = Number(material.min_stock || 0);
      const low = minimum > 0 && stock <= minimum;
      return `<tr><td><b>${safe(material.name)}</b></td><td>${number(stock)} ${safe(material.unit)}</td><td>${number(minimum)} ${safe(material.unit)}</td><td><span class="badge ${low ? 'wait' : 'ready'}">${low ? 'Menipis' : 'Aman'}</span></td></tr>`;
    }).join('');
    root.innerHTML = `<h2>Stok Bahan Baku</h2><p class="muted">Tampilan baca-saja. Hubungi Admin untuk restok atau perubahan stok.</p><div style="overflow:auto"><table style="min-width:600px"><thead><tr><th>Bahan</th><th>Stok Saat Ini</th><th>Stok Minimum</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted" style="text-align:center;padding:20px">Data stok belum tersedia.</td></tr>'}</tbody></table></div>`;
  }
  window.addEventListener('nesbooth-cloud-updated', render);
  document.querySelector('[data-page="stockview"]')?.addEventListener('click', render);
  render();
})();
