(() => {
  const css = `
    .receipt-sheet{position:fixed;inset:0;z-index:99;background:#102a4388;display:grid;place-items:center;padding:20px}
    .receipt-paper{width:min(320px,100%);background:#fff;border-radius:4px;padding:18px;color:#111;box-shadow:0 18px 48px #0005;font:13px "Courier New",monospace}.receipt-paper h2{margin:0;text-align:center;font-size:23px;letter-spacing:1px}.receipt-paper .sub{text-align:center;color:#222;font-size:11px;line-height:1.45;margin:5px 0 14px}
    .receipt-meta{border-top:1px dashed #333;border-bottom:1px dashed #333;padding:10px 0;margin:12px 0;line-height:1.75}.receipt-lines{border-bottom:1px dashed #333;padding:9px 0}.receipt-line{display:flex;justify-content:space-between;gap:10px;padding:4px 0}.receipt-line small{color:#222}
    .receipt-total{font-size:17px;font-weight:800;margin:14px 0;display:flex;justify-content:space-between}.receipt-summary{break-inside:avoid;page-break-inside:avoid}.receipt-actions{display:flex;gap:9px}.receipt-actions button{flex:1;border:0;border-radius:8px;padding:11px;font-weight:700;cursor:pointer}.close-receipt{background:#edf2f7;color:#334e68}.receipt-print{background:#14b87a;color:#fff}
    @page{margin:0}
    .receipt-tail{display:none}
    @media print{html,body{width:58mm!important;margin:0!important;padding:0!important;background:#fff!important}body>*:not(#receiptToPrint){display:none!important}#receiptToPrint{position:static!important;display:block!important;width:58mm!important;background:#fff!important;padding:0!important;margin:0!important}.receipt-paper{box-sizing:border-box!important;box-shadow:none!important;width:48mm!important;min-height:0!important;margin:0 auto!important;padding:3mm 0!important;border-radius:0!important;font:11px "Courier New",monospace!important;color:#000!important;break-inside:avoid!important;page-break-inside:avoid!important}.receipt-paper h2{font-size:17px!important}.receipt-paper .sub{font-size:10px!important;margin:3px 0 8px!important}.receipt-meta{padding:5px 0!important;margin:6px 0!important;line-height:1.5!important}.receipt-lines{padding:5px 0!important}.receipt-line{display:block!important;padding:2px 0!important}.receipt-line>span{display:block!important;min-width:0!important;overflow-wrap:anywhere!important}.receipt-line>b{display:block!important;margin-top:1px!important;text-align:right!important;white-space:nowrap!important}.receipt-summary{break-inside:avoid!important;page-break-inside:avoid!important}.receipt-total{font-size:14px!important;margin:8px 0!important}.receipt-tail{display:block!important;height:12mm!important}.receipt-actions,.printer-note{display:none!important}}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  document.querySelectorAll('.method[data-method="Kartu"],.method[data-method="E-Wallet"]').forEach(button => button.remove());
  const queueNameStyle = document.createElement('style'); queueNameStyle.textContent = '.queue-details b,#nowName{display:none!important}'; document.head.appendChild(queueNameStyle);
  const rupiah = value => 'Rp' + Number(value || 0).toLocaleString('id-ID');
  const receiptText = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E\n]/g, '');
  const receiptRow = (left, right = '', width = 32) => {
    const cleanLeft = receiptText(left), cleanRight = receiptText(right);
    if (!cleanRight) return cleanLeft.slice(0, width);
    const space = Math.max(1, width - cleanLeft.length - cleanRight.length);
    return cleanLeft.slice(0, Math.max(1, width - cleanRight.length - 1)) + ' '.repeat(space) + cleanRight;
  };
  const receiptCenter = (value, width = 32) => { const clean = receiptText(value).slice(0, width); return ' '.repeat(Math.max(0, Math.floor((width - clean.length) / 2))) + clean; };
  function tabletReceiptText(data) {
    const divider = '-'.repeat(32);
    const items = data.items.flatMap(item => {
      const parts = String(item.name).split(' — ');
      return [receiptRow(`${item.qty} ${parts.shift()}`, rupiah(item.price * item.qty)), ...parts.flatMap(part => part.split(' • ').map(option => `  ${receiptText(option)}`))];
    });
    return [receiptCenter('NESBOOTH'), receiptCenter('STRUK PEMBAYARAN'), receiptCenter('Jl. Karya No.A3, Karang Berombak'), receiptCenter('Medan, Sumatera Utara 20117'), divider, `ANTRIAN : ${receiptText(data.queueNumber)}`, `RCPT#    : ${receiptText(data.receiptNumber)}`, `TANGGAL  : ${receiptText(data.date)}`, `BAYAR    : ${receiptText(data.method)}`, divider, ...items, divider, receiptRow('TOTAL', rupiah(data.total)), '', receiptCenter('Terima kasih'), receiptCenter('Sampai jumpa kembali'), ''].join('\n');
  }
  function base64Utf8(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }
  function rawBtReceiptText(data) {
    // Pertahankan tata letak teks monospasi yang paling stabil pada RawBT.
    // Hanya judul dan total yang dibuat tebal dengan ESC/POS.
    const esc = '\x1B';
    const bold = enabled => esc + 'E' + String.fromCharCode(enabled ? 1 : 0);
    const divider = '-'.repeat(32);
    const itemLines = data.items.flatMap(item => {
      const parts = String(item.name).split(' — ');
      const name = receiptText(parts.shift());
      const price = rupiah(item.price * item.qty);
      const extra = parts.flatMap(part => part.split(' • ').map(option => `  ${receiptText(option)}`));
      return [receiptRow(`${item.qty} ${name}`, price), ...extra];
    });
    const meta = (label, value) => `${label.padEnd(8)}: ${receiptText(value)}`;
    return [
      esc + '@', bold(true), receiptCenter('NESBOOTH'), '\n', bold(false),
      receiptCenter('STRUK PEMBAYARAN'), '\n',
      receiptCenter('Jl. Karya No.A3, Karang Berombak'), '\n',
      receiptCenter('Medan, Sumatera Utara 20117'), '\n',
      divider, '\n',
      meta('ANTRIAN', data.queueNumber), '\n',
      meta('RCPT#', data.receiptNumber), '\n',
      meta('TANGGAL', String(data.date).replace(',', '')), '\n',
      meta('BAYAR', data.method), '\n',
      divider, '\n',
      ...itemLines.map(line => `${line}\n`),
      divider, '\n', bold(true), receiptRow('TOTAL', rupiah(data.total)), '\n', bold(false),
      '\n', receiptCenter('Terima kasih'), '\n', receiptCenter('Sampai jumpa kembali'), '\n\n\n'
    ].join('');
  }
  function printViaRawBt(data) {
    // RawBT menerima data ESC/POS melalui Android Intent. Package dikunci ke
    // RawBT agar Android tidak memunculkan pilihan aplikasi setiap kali cetak.
    if (!/Android/i.test(navigator.userAgent)) return false;
    const encoded = base64Utf8(rawBtReceiptText(data));
    const intent = `intent:base64,${encoded}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
    window.location.href = intent;
    return true;
  }
  async function shareTabletReceipt(data) {
    const filename = `struk-${String(data.receiptNumber || 'nesbooth').replace(/[^a-z0-9_-]/gi, '')}.txt`;
    const file = new File([tabletReceiptText(data)], filename, {type:'text/plain'});
    if (navigator.share) {
      const payload = {title:'Struk NESBOOTH', text:'Pilih aplikasi printer Bluetooth untuk mencetak struk.'};
      if (!navigator.canShare || navigator.canShare({files:[file]})) payload.files = [file];
      await navigator.share(payload);
      return;
    }
    const url = URL.createObjectURL(file), link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    show('File struk tersimpan. Buka melalui aplikasi printer Bluetooth.');
  }
  // Minuman langsung masuk ke keranjang tanpa pilihan level gula atau es.
  cart.forEach(item => delete item.variant);
  change = function(index, delta, encodedVariant = '') { const variant = decodeURIComponent(encodedVariant || ''); const entry = cart.find(item => item.i === index && (item.variant || '') === variant); if (!entry) return; entry.q += delta; if (entry.q < 1) cart = cart.filter(item => item !== entry); renderCart(); };
  renderCart = function () {
    const subtotalAmount = cart.reduce((total, entry) => total + (entry.unitPrice ?? products[entry.i][2]) * entry.q, 0);
    const totalAmount = subtotalAmount;
    cartItems.innerHTML = cart.length ? cart.map(entry => `<div class="item"><div><div class="item-name">${products[entry.i][0]}</div>${entry.variant ? `<div class="item-price">${entry.variant}</div>` : ''}<div class="item-price">${rupiah(entry.unitPrice ?? products[entry.i][2])}</div></div><div class="qty"><button onclick="change(${entry.i},-1,'${encodeURIComponent(entry.variant || '')}')">−</button><b>${entry.q}</b><button onclick="change(${entry.i},1,'${encodeURIComponent(entry.variant || '')}')">+</button></div></div>`).join('') : '<div class="empty">Keranjang masih kosong<br><small>Pilih produk untuk memulai transaksi</small></div>';
    document.getElementById('total').textContent = rupiah(totalAmount);
    document.getElementById('count').textContent = cart.reduce((total, entry) => total + entry.q, 0) + ' item';
    payBtn.disabled = !cart.length;
    window.orderTotal = totalAmount;
  };
  renderCart();
  const safe = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function showReceipt(data) {
    document.getElementById('receiptToPrint')?.remove();
    document.getElementById('receiptPageSize')?.remove();
    // Tinggi dihitung agar footer dan ruang sobek tetap berada pada halaman
    // yang sama. Beberapa driver POS58 mencetak halaman kedua lebih dahulu.
    const detailLines = data.items.reduce((count, item) => count + 1 + (String(item.name).includes(' — ') ? 1 : 0), 0);
    const paperHeight = Math.min(280, 145 + detailLines * 12);
    const pageStyle = document.createElement('style');
    pageStyle.id = 'receiptPageSize';
    pageStyle.textContent = `@media print{@page{size:58mm ${paperHeight}mm;margin:0}}`;
    document.head.appendChild(pageStyle);
    const wrapper = document.createElement('div'); wrapper.id = 'receiptToPrint'; wrapper.className = 'receipt-sheet';
    const lines = data.items.map(item => { const parts = String(item.name).split(' — '); const main = parts.shift(); const variant = parts.join(' — '); const options = variant ? variant.split(' • ').map(option => `<small style="display:block;padding-left:12px">${safe(option)}</small>`).join('') : ''; return `<div class="receipt-line"><span><b>${item.qty} ${safe(main)}</b>${options}</span><b>${rupiah(item.price * item.qty)}</b></div>`; }).join('');
    wrapper.innerHTML = `<article class="receipt-paper"><h2>NESBOOTH</h2><p class="sub">STRUK PEMBAYARAN<br>Jl. Karya No.A3, Karang Berombak<br>Medan, Sumatera Utara 20117</p><div class="receipt-meta"><div>ANTRIAN : <b>${safe(data.queueNumber)}</b></div><div>RCPT# : ${safe(data.receiptNumber)}</div><div>TANGGAL : ${safe(data.date)}</div><div>BAYAR : ${safe(data.method)}</div></div><div class="receipt-lines">${lines}</div><div class="receipt-summary"><div class="receipt-total"><span>TOTAL</span><span>${rupiah(data.total)}</span></div><p class="sub">Terima kasih<br>Sampai jumpa kembali</p></div><div class="receipt-tail"></div><div class="receipt-actions"><button class="close-receipt">Tutup</button><button class="receipt-print">🖨 Cetak Struk</button></div></article>`;
    document.body.appendChild(wrapper);
    wrapper.querySelector('.close-receipt').onclick = () => { wrapper.remove(); pageStyle.remove(); };
    wrapper.querySelector('.receipt-print').onclick = async () => {
      try {
        if (printViaRawBt(data)) {
          show('Struk dikirim ke RawBT.');
          return;
        }
        await shareTabletReceipt(data);
      }
      catch (error) { if (error?.name !== 'AbortError') show('Struk belum dapat dibagikan. Pastikan aplikasi printer Bluetooth sudah terpasang.'); }
    };
  }
  const queueDay = () => new Date().toLocaleDateString('sv-SE');
  function claimDailyQueueNumber() {
    const today = queueDay();
    let state = {};
    try { state = JSON.parse(localStorage.getItem('nestbooth-queue-day')) || {}; } catch (e) {}
    if (state.day !== today) { state = {day: today, last: 0}; }
    state.last += 1;
    localStorage.setItem('nestbooth-queue-day', JSON.stringify(state));
    const storedPrefix = typeof appSettings !== 'undefined' ? appSettings.queuePrefix : '';
    const prefix = String(storedPrefix || '').toUpperCase() === 'A' ? '' : storedPrefix;
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
  renderQueue = function(){
    baseRenderQueue();
    // Buat satu area aksi yang konsisten untuk setiap baris. Data antrean dapat
    // dimuat ulang dari server sewaktu-waktu, sehingga tombol tidak boleh
    // bergantung pada posisi elemen lama di layar.
    document.querySelectorAll('#queueList .queue-item').forEach((row, index) => {
      const item = queue[index];
      if (!item || item.status === 'Selesai') return;
      const actions = document.createElement('div');
      actions.className = 'queue-row-actions';
      const processButton = row.querySelector('button[onclick^="startQueue"]');
      if (processButton) {
        processButton.removeAttribute('onclick');
        processButton.addEventListener('click', () => startQueue(queue.indexOf(item)));
        actions.appendChild(processButton);
      }
      const button = document.createElement('button');
      button.className = 'btn ghost queue-finish-button';
      button.type = 'button';
      button.textContent = 'Selesai';
      button.addEventListener('click', () => finishQueue(queue.indexOf(item)));
      actions.appendChild(button);
      row.appendChild(actions);
    });
    if (!queue.some(item => item.status === 'Diproses')) {
      nowNumber.textContent = '—';
      nowName.textContent = 'Tidak ada antrean';
    }
  };
  renderQueue();
  const originalStartQueue = startQueue;
  startQueue = function(index) {
    const before = new Map(queue.map(item => [item.id, item.status]));
    originalStartQueue(index);
    if (!/\.onrender\.com$/i.test(location.hostname)) return;
    queue.filter(item => item.id && before.get(item.id) !== item.status).forEach(item => {
      fetch('/api/queue', {
        method: 'PUT', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: item.id, status: item.status})
      }).then(response => {
        if (!response.ok) throw new Error('Status antrean gagal disimpan');
      }).catch(error => show(error.message || 'Status antrean gagal disimpan.'));
    });
  };
  async function finishQueue(index) {
    const item = queue[index];
    if (!item || item.status === 'Selesai') return;
    if (!window.confirm(`Selesaikan antrean ${item.n}?`)) return;
    const previousStatus = item.status;
    item.status = 'Selesai';
    if (current === index) current = Math.max(0, queue.findIndex(entry => entry.status === 'Diproses'));
    renderQueue();
    if (!/\.onrender\.com$/i.test(location.hostname) || !item.id) {
      show(`Antrean ${item.n} selesai.`);
      return;
    }
    try {
      const response = await fetch('/api/queue', {
        method: 'PUT', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: item.id, status: 'Selesai'})
      });
      if (!response.ok) throw new Error('Status antrean gagal disimpan');
      show(`Antrean ${item.n} selesai dan diperbarui untuk semua perangkat.`);
    } catch (error) {
      item.status = previousStatus;
      renderQueue();
      show(error.message || 'Status antrean gagal disimpan.');
    }
  }
  const originalPay = confirmPay.onclick;
  confirmPay.onclick = () => {
    const subtotal = cart.reduce((total, entry) => total + (entry.unitPrice ?? products[entry.i][2]) * entry.q, 0);
    const tax = 0;
    const queueNumber = claimDailyQueueNumber();
    const data = { items: cart.map(entry => ({name: products[entry.i][0] + (entry.variant ? ' — ' + entry.variant : ''), price: entry.unitPrice ?? products[entry.i][2], qty: entry.q})), subtotal, tax, taxPercent: 0, total: window.orderTotal, method, queueNumber, receiptNumber: 'NB'+Date.now().toString().slice(-6), date: new Date().toLocaleString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) };
    // Saat POS dibuka dari server online, simpan dahulu ke database.
    // Di Render tidak boleh fallback ke localStorage: data itu tidak akan
    // terlihat oleh kasir/perangkat lain.
    const cloudPayment = method === 'QRIS'
      ? window.nesboothCloudCreateMidtransPayment
      : window.nesboothCloudCreateSale;
    if (typeof cloudPayment === 'function') {
      confirmPay.disabled = true;
      cloudPayment(data).then(remote => {
        data.queueNumber = remote.queueNumber;
        data.receiptNumber = remote.receiptNumber;
        data.subtotal = remote.subtotal;
        data.tax = remote.tax;
        data.taxPercent = remote.taxPercent;
        data.total = remote.total;
        modalBg.classList.remove('show');
        queue.push({id: remote.queueId, n: data.queueNumber, name: '', items: data.items.reduce((sum, item) => sum + item.qty, 0) + ' item', status: 'Menunggu'});
        cart = []; renderCart(); renderQueue();
        saveSale(data); showReceipt(data);
        // Cetak otomatis bersifat opsional; kegagalan printer tidak boleh membatalkan transaksi.
        if (typeof window.nesboothQzPrintReceipt === 'function') {
          window.nesboothQzPrintReceipt(data).then(sent => { if (sent) show('Struk dikirim langsung ke printer.'); })
            .catch(error => show(error.message || 'Struk belum dapat dicetak otomatis.'));
        }
        setTimeout(() => { renderDailyTransactions(); renderSixMonthReport(); }, 0);
        show(method === 'QRIS' ? 'Pembayaran QRIS berhasil. Nomor antrean ' + data.queueNumber + ' dibuat.' : 'Pembayaran berhasil. Nomor antrean ' + data.queueNumber + ' dibuat.');
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
