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
  let snapLoader;
  const loadSnap = async config => {
    if (window.snap) return;
    if (!snapLoader) snapLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = config.snapUrl; script.dataset.clientKey = config.clientKey;
      script.onload = resolve; script.onerror = () => reject(new Error('Layar pembayaran Midtrans tidak dapat dimuat'));
      document.head.appendChild(script);
    });
    await snapLoader;
    if (!window.snap) throw new Error('Midtrans tidak dapat dimuat');
  };
  const createMidtransPayment = async order => {
    const config = await api('/api/midtrans/config');
    if (!config.configured) throw new Error('Midtrans belum dikonfigurasi di Render');
    const payment = await api('/api/midtrans/payment', {method: 'POST', body: JSON.stringify({items: order.items, method: 'QRIS'})});
    await loadSnap(config);
    return new Promise((resolve, reject) => {
      let done = false, polling = false, attempts = 0;
      const finish = (error, value) => {
        if (done) return; done = true; clearInterval(timer);
        if (error) reject(error); else resolve(value);
      };
      const check = async () => {
        if (done || polling) return;
        polling = true;
        try {
          const state = await api(`/api/midtrans/status?order_id=${encodeURIComponent(payment.orderId)}`);
          if (state.status === 'paid' && state.queue) {
            setTimeout(loadCloudData, 0);
            finish(null, {queueNumber: state.queue.queue_number, queueId: state.queue.id, receiptNumber: payment.receiptNumber, subtotal: payment.subtotal, tax: 0, total: payment.total, taxPercent: 0});
          } else if (state.status === 'failed') finish(new Error('Pembayaran QRIS tidak berhasil atau telah dibatalkan'));
          else if (++attempts >= 180) finish(new Error('Status pembayaran masih menunggu. Jangan membuat tagihan QRIS kedua untuk pesanan ini.'));
        } catch (error) { if (++attempts >= 10) finish(error); }
        finally { polling = false; }
      };
      const timer = setInterval(check, 2000);
      window.snap.pay(payment.token, {
        onSuccess: async () => { try { await api(`/api/midtrans/status?order_id=${encodeURIComponent(payment.orderId)}&verify=1`); } catch (error) {} check(); },
        onPending: () => { if (typeof show === 'function') show('QRIS menunggu pembayaran. Transaksi akan diproses otomatis setelah lunas.'); },
        onError: () => finish(new Error('Pembayaran QRIS tidak dapat diproses')),
        onClose: () => { if (typeof show === 'function') show('Tagihan QRIS masih menunggu. Buka kembali pembayaran bila pelanggan belum membayar.'); }
      });
      check();
    });
  };
  async function loadCloudData() {
    try {
      const data = await api('/api/bootstrap');
      if (!data.products?.length) return;
      window.nesboothCloudState = data;
      window.nesboothCloudError = '';
      window.dispatchEvent(new Event('nesbooth-cloud-updated'));
      window.nesboothCloudCreateSale = createCloudSale;
      window.nesboothCloudCreateMidtransPayment = createMidtransPayment;
      products.splice(0, products.length, ...data.products.map(product => [product.name, product.category, Number(product.price), 100, '🥤']));
      materials.splice(0, materials.length, ...data.materials.map(material => ({name: material.name, unit: material.unit, stock: Number(material.stock), min: Number(material.min_stock)})));
      const materialNames = new Map(data.materials.map(material => [material.id, material.name]));
      const recipeByProduct = new Map(data.products.map(product => [product.id, {}]));
      (data.recipes || []).forEach(recipe => {
        const materialName = materialNames.get(recipe.material_id);
        const productRecipe = recipeByProduct.get(recipe.product_id);
        if (materialName && productRecipe) productRecipe[materialName] = Number(recipe.amount);
      });
      recipes.splice(0, recipes.length, ...data.products.map(product => recipeByProduct.get(product.id) || {}));
      if (data.settings) {
        appSettings = {storeName: data.settings.store_name, taxPercent: 0, queuePrefix: data.settings.queue_prefix};
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
  window.nesboothCloudCreateMidtransPayment = null;
  window.nesboothCloudReload = loadCloudData;
  loadCloudData();
  // Antrean diperbarui cepat agar layar kasir/perangkat lain mengikuti status yang sama.
  setInterval(loadCloudData, 5000);
})();
