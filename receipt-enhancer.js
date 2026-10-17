(() => {
  const css = `
    .receipt-sheet{position:fixed;inset:0;z-index:99;background:#102a4388;display:grid;place-items:center;padding:20px}
    .receipt-paper{width:min(390px,100%);background:#fff;border-radius:4px;padding:20px;color:#111;box-shadow:0 18px 48px #0005;font:14px "Courier New",monospace}.receipt-paper h2{margin:0;text-align:center;font-size:25px;letter-spacing:1px}.receipt-paper .sub{text-align:center;color:#222;font-size:12px;line-height:1.45;margin:5px 0 16px}
    .receipt-meta{border-top:1px dashed #333;border-bottom:1px dashed #333;padding:10px 0;margin:12px 0;line-height:1.75}.receipt-lines{border-bottom:1px dashed #333;padding:9px 0}.receipt-line{display:flex;justify-content:space-between;gap:10px;padding:4px 0}.receipt-line small{color:#222}
    .receipt-total{font-size:17px;font-weight:800;margin:14px 0;display:flex;justify-content:space-between}.receipt-actions{display:flex;gap:9px}.receipt-actions button{flex:1;border:0;border-radius:8px;padding:11px;font-weight:700;cursor:pointer}.print-receipt{background:#1677ff;color:#fff}.close-receipt{background:#edf2f7;color:#334e68}
    @media print{body>*:not(#receiptToPrint){display:none!important}#receiptToPrint{position:static!important;display:block!important;background:#fff!important;padding:0!important}.receipt-paper{box-shadow:none!important;width:80mm!important;margin:0!important;border-radius:0!important}.receipt-actions{display:none!important}}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  document.querySelectorAll('.method[data-method="Kartu"],.method[data-method="E-Wallet"]').forEach(button => button.remove());
  const queueNameStyle = document.createElement('style'); queueNameStyle.textContent = '.queue-details b,#nowName{display:none!important}'; document.head.appendChild(queueNameStyle);
  const rupiah = value => 'Rp' + Number(value || 0).toLocaleString('id-ID');
  // Minuman langsung masuk ke keranjang tanpa pilihan level gula atau es.
  cart.forEach(item => delete item.variant);
  change = function(index, delta, encodedVariant = '') { const variant = decodeURIComponent(encodedVariant || ''); const entry = cart.find(item => item.i === index && (item.variant || '') === variant); if (!entry) return; entry.q += delta; if (entry.q < 1) cart = cart.filter(item => item !== entry); renderCart(); };
  /* Perbaikan tampilan pajak kasir: jangan gunakan nama variabel yang sama dengan elemen #tax. */
  renderCart = function () {
    const subtotalAmount = cart.reduce((total, entry) => total + (entry.unitPrice ?? products[entry.i][2]) * entry.q, 0);
    const taxAmount = Math.round(subtotalAmount * 0.11);
    const totalAmount = subtotalAmount + taxAmount;
    cartItems.innerHTML = cart.length ? cart.map(entry => `<div class="item"><div><div class="item-name">${products[entry.i][0]}</div>${entry.variant ? `<div class="item-price">${entry.variant}</div>` : ''}<div class="item-price">${rupiah(entry.unitPrice ?? products[entry.i][2])}</div></div><div class="qty"><button onclick="change(${entry.i},-1,'${encodeURIComponent(entry.variant || '')}')">−</button><b>${entry.q}</b><button onclick="change(${entry.i},1,'${encodeURIComponent(entry.variant || '')}')">+</button></div></div>`).join('') : '<div class="empty">Keranjang masih kosong<br><small>Pilih produk untuk memulai transaksi</small></div>';
    document.getElementById('subtotal').textContent = rupiah(subtotalAmount);
    document.getElementById('tax').textContent = rupiah(taxAmount);
    document.getElementById('total').textContent = rupiah(totalAmount);
    document.getElementById('count').textContent = cart.reduce((total, entry) => total + entry.q, 0) + ' item';
    payBtn.disabled = !cart.length;
    window.orderTotal = totalAmount;
  };
  renderCart();
  const safe = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function showReceipt(data) {
    document.getElementById('receiptToPrint')?.remove();
    const wrapper = document.createElement('div'); wrapper.id = 'receiptToPrint'; wrapper.className = 'receipt-sheet';
    const lines = data.items.map(item => { const parts = String(item.name).split(' — '); const main = parts.shift(); const variant = parts.join(' — '); const options = variant ? variant.split(' • ').map(option => `<small style="display:block;padding-left:12px">${safe(option)}</small>`).join('') : ''; return `<div class="receipt-line"><span><b>${item.qty} ${safe(main)}</b>${options}</span><b>${rupiah(item.price * item.qty)}</b></div>`; }).join('');
    wrapper.innerHTML = `<article class="receipt-paper"><h2>NesBooth</h2><p class="sub">Jl. Karya No.A3, Karang Berombak<br>Kec. Medan Bar., Kota Medan<br>Sumatera Utara 20117</p><div class="receipt-meta"><div>NO. ANTRIAN : <b>${safe(data.queueNumber)}</b></div><div>RCPT# : ${safe(data.receiptNumber)}</div><div>TANGGAL : ${safe(data.date)}</div><div>METODE : ${safe(data.method)}</div></div><div class="receipt-lines">${lines}</div><div class="receipt-line"><span>SUBTOTAL</span><span>${rupiah(data.subtotal)}</span></div><div class="receipt-line"><span>PAJAK (${data.taxPercent}%)</span><span>${rupiah(data.tax)}</span></div><div class="receipt-total"><span>TOTAL</span><span>${rupiah(data.total)}</span></div><p class="sub">Terima Kasih<br>Sampai jumpa kembali</p><div class="receipt-actions"><button class="close-receipt">Tutup</button><button class="print-receipt">🖨 Cetak Struk</button></div></article>`;
    document.body.appendChild(wrapper);
    wrapper.querySelector('.close-receipt').onclick = () => wrapper.remove();
    wrapper.querySelector('.print-receipt').onclick = () => window.print();
  }
  const queueDay = () => new Date().toLocaleDateString('sv-SE');
  function claimDailyQueueNumber() {
    const today = queueDay();
    let state = {};
    try { state = JSON.parse(localStorage.getItem('nestbooth-queue-day')) || {}; } catch (e) {}
    if (state.day !== today) { state = {day: today, last: 0}; }
    state.last += 1;
    localStorage.setItem('nestbooth-queue-day', JSON.stringify(state));
    const prefix = typeof appSettings !== 'undefined' ? appSettings.queuePrefix : 'A';
    return String(prefix).toUpperCase() + String(state.last).padStart(3, '0');
  }
  try {
    const prior = JSON.parse(localStorage.getItem('nestbooth-queue-day')) || {};
    if (prior.day !== queueDay()) { queue.splice(0, queue.length); current = 0; renderQueue(); }
  } catch (e) {}
  const salesStorageKey = 'nestbooth-sales-history';
  const todayKey = () => new Date().toLocaleDateString('sv-SE');
  function getSales() { try { return JSON.parse(localStorage.getItem(salesStorageKey)) || []; } catch (e) { return []; } }
  function saveSale(data) { const sales = getSales(); sales.push({...data, day: todayKey(), timestamp: new Date().toISOString()}); localStorage.setItem(salesStorageKey, JSON.stringify(sales)); }
  function renderDailyTransactions() {
    const body = document.getElementById('transactions'); if (!body) return;
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 6);
    const sales = getSales().filter(sale => new Date(sale.timestamp) >= cutoff);
    body.innerHTML = sales.length ? sales.slice().reverse().map(sale => `<tr><td>${safe(sale.receiptNumber)}</td><td>${new Date(sale.timestamp).toLocaleString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</td><td>${sale.items.reduce((sum,item)=>sum+item.qty,0)} produk</td><td>${safe(sale.method)}</td><td>${rupiah(sale.total)}</td><td><span class="badge ready">Selesai</span></td></tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:#718096;padding:24px">Belum ada transaksi dalam enam bulan terakhir.</td></tr>';
  }
  function renderSixMonthReport(fromValue, toValue) {
    const today = new Date(), cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 6);
    const dateValue = date => date.toLocaleDateString('sv-SE');
    const from = fromValue ? new Date(fromValue + 'T00:00:00') : cutoff;
    const to = toValue ? new Date(toValue + 'T23:59:59') : today;
    const sales = getSales().filter(sale => { const time = new Date(sale.timestamp); return time >= from && time <= to; });
    const total = sales.reduce((sum,sale)=>sum + Number(sale.total || 0),0);
    const report = document.getElementById('laporan'); if (!report) return;
    document.getElementById('sixMonthSales')?.remove();
    const box = document.createElement('div'); box.id = 'sixMonthSales'; box.className = 'card section'; box.style.marginTop = '18px';
    box.innerHTML = `<h2>Penjualan 6 Bulan Terakhir</h2><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:0 0 18px"><label class="field">Dari tanggal<input id="salesFrom" type="date" min="${dateValue(cutoff)}" max="${dateValue(today)}" value="${dateValue(from)}"></label><label class="field">Sampai tanggal<input id="salesTo" type="date" min="${dateValue(cutoff)}" max="${dateValue(today)}" value="${dateValue(to)}"></label><button id="applySalesFilter" class="btn" type="button">Tampilkan</button></div><div class="dash-grid"><div class="stat"><div class="label">Total Penjualan</div><div class="value">${rupiah(total)}</div></div><div class="stat"><div class="label">Jumlah Transaksi</div><div class="value">${sales.length}</div></div><div class="stat"><div class="label">Rata-rata Transaksi</div><div class="value">${rupiah(sales.length ? total/sales.length : 0)}</div></div></div><p class="muted" style="margin:12px 0 0">Pilih rentang tanggal dalam enam bulan terakhir.</p>`;
    report.appendChild(box);
    document.getElementById('applySalesFilter').onclick = () => { const start = document.getElementById('salesFrom').value, end = document.getElementById('salesTo').value; if (!start || !end || start > end) { show('Pilih rentang tanggal yang valid.'); return; } renderSixMonthReport(start, end); };
  }
  renderDailyTransactions(); renderSixMonthReport();
  const baseRenderQueue = renderQueue;
  renderQueue = function(){baseRenderQueue();if(location.protocol==='http:')fetch('/api/queue',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({queue,current})}).catch(()=>{})};
  renderQueue();
  const originalPay = confirmPay.onclick;
  confirmPay.onclick = () => {
    const subtotal = cart.reduce((total, entry) => total + (entry.unitPrice ?? products[entry.i][2]) * entry.q, 0);
    const tax = Math.round(subtotal * 0.11);
    const queueNumber = claimDailyQueueNumber();
    const data = { items: cart.map(entry => ({name: products[entry.i][0] + (entry.variant ? ' — ' + entry.variant : ''), price: entry.unitPrice ?? products[entry.i][2], qty: entry.q})), subtotal, tax, taxPercent: subtotal ? Number(((tax / subtotal) * 100).toFixed(1)) : 0, total: window.orderTotal, method, queueNumber, receiptNumber: 'NB'+Date.now().toString().slice(-6), date: new Date().toLocaleString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) };
    // Saat POS dibuka dari server online, simpan dahulu ke database.
    // Di Render tidak boleh fallback ke localStorage: data itu tidak akan
    // terlihat oleh kasir/perangkat lain.
    if (typeof window.nesboothCloudCreateSale === 'function') {
      confirmPay.disabled = true;
      window.nesboothCloudCreateSale(data).then(remote => {
        data.queueNumber = remote.queueNumber;
        data.receiptNumber = remote.receiptNumber;
        data.subtotal = remote.subtotal;
        data.tax = remote.tax;
        data.taxPercent = remote.taxPercent;
        data.total = remote.total;
        modalBg.classList.remove('show');
        queue.push({n: data.queueNumber, name: '', items: data.items.reduce((sum, item) => sum + item.qty, 0) + ' item', status: 'Menunggu'});
        cart = []; renderCart(); renderQueue();
        saveSale(data); showReceipt(data);
        setTimeout(() => { renderDailyTransactions(); renderSixMonthReport(); }, 0);
        show('Pembayaran berhasil. Nomor antrean ' + data.queueNumber + ' dibuat.');
      }).catch(error => show(error.message || 'Pembayaran belum dapat disimpan.'))
        .finally(() => { confirmPay.disabled = false; });
      return;
    }
    if (/\.onrender\.com$/i.test(location.hostname)) {
      const reason = window.nesboothCloudError ? ` (${window.nesboothCloudError})` : '';
      show('Transaksi belum disimpan karena database online belum terhubung' + reason + '. Periksa konfigurasi Supabase di Render, lalu coba lagi.');
      return;
    }
    const originalPush = queue.push;
    queue.push = function (entry) { entry.n = queueNumber; entry.name = ''; return originalPush.call(queue, entry); };
    try { originalPay?.call(confirmPay); } finally { queue.push = originalPush; }
    if (data.items.length && !cart.length) {
      saveSale(data);
      showReceipt(data);
      setTimeout(() => { renderDailyTransactions(); renderSixMonthReport(); }, 0);
    }
  };
})();
