// Menghubungkan POS dengan API Render. Tidak pernah memuat kunci rahasia di browser.
(() => {
  if (!/^https?:$/.test(location.protocol)) return;
  // Pada alamat Render, transaksi wajib melewati database pusat. Jangan
  // mengizinkan fallback diam-diam ke localStorage karena perangkat lain
  // tidak akan dapat melihat transaksi tersebut.
  const mustUseCloud = /\.onrender\.com$/i.test(location.hostname);
  const api = async (url, options) => {
    const response = await fetch(url, {headers: {'Content-Type': 'application/json'}, ...options});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Server tidak dapat dihubungi');
    return data;
  };
  const createCloudSale = async order => {
    const result = await api('/api/sales', {method: 'POST', body: JSON.stringify({items: order.items, method: order.method})});
    setTimeout(loadCloudData, 0);
    return {
      queueNumber: result.queue.queue_number,
      queueId: result.queue.id,
      receiptNumber: result.sale.receipt_number,
      subtotal: Number(result.sale.subtotal),
      tax: Number(result.sale.tax_amount),
      total: Number(result.sale.total),
      taxPercent: Number(result.taxPercent)
    };
  };
  async function loadCloudData() {
    try {
      const data = await api('/api/bootstrap');
      if (!data.products?.length) return;
      window.nesboothCloudState = data;
      window.nesboothCloudError = '';
      window.dispatchEvent(new Event('nesbooth-cloud-updated'));
      window.nesboothCloudCreateSale = createCloudSale;
      products.splice(0, products.length, ...data.products.map(product => [product.name, product.category, Number(product.price), 100, '🥤']));
      materials.splice(0, materials.length, ...data.materials.map(material => ({name: material.name, unit: material.unit, stock: Number(material.stock), min: Number(material.min_stock)})));
      recipes.splice(0, recipes.length, ...products.map(() => ({})));
      if (data.settings) {
        appSettings = {storeName: data.settings.store_name, taxPercent: Number(data.settings.tax_percent), queuePrefix: data.settings.queue_prefix};
        document.querySelector('.brand').childNodes[1].textContent = ' ' + appSettings.storeName;
      }
      queue.splice(0, queue.length, ...data.queues.map(item => ({id: item.id, n: item.queue_number, name: '', items: item.item_count + ' item', status: item.status})));
      current = Math.max(0, queue.findIndex(item => item.status === 'Diproses'));
      renderProducts(); renderCart(); refreshStockAdmin(); renderQueue();
    } catch (error) {
      const message = error.message || 'Server tidak dapat dihubungi';
      console.info('Koneksi database NesBooth gagal:', message);
      window.nesboothCloudError = message;
      window.nesboothCloudCreateSale = null;
      if (mustUseCloud) {
        window.dispatchEvent(new Event('nesbooth-cloud-unavailable'));
      }
    }
  }
  window.nesboothCloudCreateSale = null;
  loadCloudData();
  // Antrean diperbarui cepat agar layar kasir/perangkat lain mengikuti status yang sama.
  setInterval(loadCloudData, 5000);
})();
