// Menyimpan perubahan pengelolaan toko ke database pusat saat POS dibuka di Render.
(() => {
  if (!/\.onrender\.com$/i.test(location.hostname)) return;

  const request = async (url, options = {}) => {
    const response = await fetch(url, {headers: {'Content-Type': 'application/json'}, ...options});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Perubahan tidak dapat disimpan');
    return data;
  };
  const state = () => window.nesboothCloudState || {products: [], materials: []};
  const reload = async () => {
    await window.nesboothCloudReload?.();
    if (typeof renderMenuEditor === 'function') renderMenuEditor();
    if (typeof refreshStockAdmin === 'function') refreshStockAdmin();
  };
  const busy = async (button, action) => {
    const label = button?.textContent;
    if (button) { button.disabled = true; button.textContent = 'Menyimpan...'; }
    try { await action(); } catch (error) { show(error.message || 'Perubahan tidak dapat disimpan'); }
    finally { if (button) { button.disabled = false; button.textContent = label; } }
  };

  // Tangkap form sebelum handler localStorage lama dijalankan.
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!['settingsForm', 'menuForm', 'stockForm'].includes(form.id)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const button = form.querySelector('button[type="submit"]');

    if (form.id === 'settingsForm') return busy(button, async () => {
      await request('/api/settings', {method: 'PUT', body: JSON.stringify({
        store_name: settingStoreName.value, tax_percent: 0, queue_prefix: settingQueuePrefix.value
      })});
      await reload(); show('Pengaturan toko tersimpan untuk semua perangkat.');
    });

    if (form.id === 'menuForm') return busy(button, async () => {
      const index = Number(menuSelect.value);
      const existing = !creatingNewMenu ? state().products[index] : null;
      const body = JSON.stringify({name: menuName.value, category: menuCategory.value, price: Number(menuPrice.value)});
      await request(existing ? `/api/products?id=${encodeURIComponent(existing.id)}` : '/api/products', {method: existing ? 'PUT' : 'POST', body});
      creatingNewMenu = false; await reload(); show('Menu tersimpan untuk semua perangkat.');
    });

    const index = Number(stockProduct.value);
    const material = state().materials[index];
    return busy(button, async () => {
      if (!material) throw new Error('Pilih bahan baku terlebih dahulu');
      const added = Number(stockQty.value);
      if (!Number.isFinite(added) || added <= 0) throw new Error('Jumlah stok tidak valid');
      await request(`/api/materials?id=${encodeURIComponent(material.id)}`, {method: 'PUT', body: JSON.stringify({
        name: material.name, unit: material.unit, stock: Number(material.stock) + added, min_stock: Number(material.min_stock || 0)
      })});
      await reload(); show(`${material.name} ditambahkan ke stok pusat.`);
    });
  }, true);

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const text = button.textContent.trim();
    if (text === 'Simpan Bahan Baru') {
      event.preventDefault(); event.stopImmediatePropagation();
      return busy(button, async () => {
        await request('/api/materials', {method: 'POST', body: JSON.stringify({
          name: newName.value, unit: newUnit.value, stock: Number(newStock.value), min_stock: 0
        })});
        newName.value = ''; newStock.value = '0'; await reload(); show('Bahan baru tersimpan untuk semua perangkat.');
      });
    }
    if (text === 'Hapus Bahan') {
      event.preventDefault(); event.stopImmediatePropagation();
      const material = state().materials[Number(stockProduct.value)];
      if (!material || !confirm(`Hapus bahan ${material.name}?`)) return;
      return busy(button, async () => {
        await request(`/api/materials?id=${encodeURIComponent(material.id)}`, {method: 'DELETE'});
        await reload(); show('Bahan dihapus dari stok pusat.');
      });
    }
    if (text === 'Hapus Menu') {
      event.preventDefault(); event.stopImmediatePropagation();
      const product = state().products[Number(menuSelect.value)];
      if (!product || !confirm(`Nonaktifkan menu ${product.name}?`)) return;
      return busy(button, async () => {
        await request(`/api/products?id=${encodeURIComponent(product.id)}`, {method: 'DELETE'});
        await reload(); show('Menu tidak lagi tampil di semua perangkat.');
      });
    }
  }, true);
})();
