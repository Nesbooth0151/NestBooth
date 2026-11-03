// Cetak langsung melalui QZ Tray (aplikasi penghubung printer di PC kasir).
// QZ Tray harus diinstal dan dijalankan pada PC yang mencetak struk.
(() => {
  const key = 'nesbooth-qz-printer';
  const get = () => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } };
  const save = value => localStorage.setItem(key, JSON.stringify({...get(), ...value}));
  const clean = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E\n]/g, '');
  const money = value => 'Rp' + Number(value || 0).toLocaleString('id-ID');
  const pad = (left, right, width = 32) => {
    left = clean(left); right = clean(right); const room = Math.max(1, width - left.length - right.length);
    return left + ' '.repeat(room) + right;
  };
  const center = (text, width = 32) => {
    text = clean(text); return ' '.repeat(Math.max(0, Math.floor((width - text.length) / 2))) + text;
  };
  let libraryPromise;
  function library() {
    if (window.qz) return Promise.resolve(window.qz);
    if (libraryPromise) return libraryPromise;
    libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.5/qz-tray.js';
      script.onload = () => window.qz ? resolve(window.qz) : reject(new Error('Library QZ Tray tidak tersedia'));
      script.onerror = () => reject(new Error('Library QZ Tray gagal dimuat. Periksa koneksi internet.'));
      document.head.appendChild(script);
    });
    return libraryPromise;
  }
  async function connect() {
    const qz = await library();
    if (!qz.websocket.isActive()) await qz.websocket.connect();
    return qz;
  }
  async function printers() {
    const qz = await connect();
    return qz.printers.find();
  }
  function rawReceipt(data) {
    const width = 32, line = '-'.repeat(width);
    const items = (data.items || []).flatMap(item => {
      const name = clean(`${item.qty} ${String(item.name || '').split(' — ')[0]}`);
      const price = money(Number(item.price || 0) * Number(item.qty || 0));
      if (name.length <= width - price.length - 1) return [pad(name, price, width)];
      return [name.slice(0, width), pad('', price, width)];
    });
    return '\x1B\x40' + '\x1B\x61\x01' + '\x1B\x21\x10' + 'NESBOOTH\n' + '\x1B\x21\x00' +
      'STRUK PEMBAYARAN\nJl. Karya No.A3, Karang Berombak\nMedan, Sumatera Utara 20117\n' +
      line + '\n' + '\x1B\x61\x00' +
      `ANTRIAN : ${clean(data.queueNumber)}\nRCPT#    : ${clean(data.receiptNumber)}\nTANGGAL  : ${clean(data.date)}\nBAYAR    : ${clean(data.method)}\n` +
      line + '\n' + items.join('\n') + '\n' + line + '\n' + '\x1B\x21\x08' + pad('TOTAL', money(data.total), width) + '\n' + '\x1B\x21\x00' +
      '\x1B\x61\x01' + 'Terima kasih\nSampai jumpa kembali\n\n\n\n\n\x1D\x56\x00';
  }
  async function printReceipt(data, force = false) {
    const settings = get();
    if (!force && !settings.auto) return false;
    const qz = await connect();
    const printer = settings.printer || await qz.printers.getDefault();
    if (!printer) throw new Error('Pilih printer terlebih dahulu di Pengaturan > Cetak Otomatis.');
    await qz.print(qz.configs.create(printer), [{type:'raw', format:'command', flavor:'plain', data:rawReceipt(data)}]);
    return true;
  }
  function addSettingsPanel() {
    const page = document.getElementById('pengaturan');
    if (!page || document.getElementById('qzPrinterPanel')) return;
    const settings = get();
    const panel = document.createElement('div'); panel.id = 'qzPrinterPanel'; panel.className = 'card section'; panel.style.marginTop = '18px';
    panel.innerHTML = `<h2>Cetak Otomatis</h2><p class="muted">Gunakan QZ Tray pada PC kasir agar struk 58 mm dikirim langsung ke printer tanpa dialog browser.</p><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end"><label style="display:grid;gap:6px;font-weight:650;min-width:250px">Printer<select id="qzPrinterSelect"><option value="">Hubungkan QZ Tray terlebih dahulu</option></select></label><button id="qzConnect" class="btn" type="button">Hubungkan QZ Tray</button><label style="display:flex;gap:8px;align-items:center;height:40px;font-weight:650"><input id="qzAuto" type="checkbox" ${settings.auto ? 'checked' : ''}> Cetak otomatis setelah pembayaran</label></div><p id="qzStatus" class="muted" style="margin:12px 0 0">QZ Tray belum dihubungkan.</p><p class="muted" style="font-size:12px">Saat pertama kali digunakan, QZ Tray mungkin meminta izin/trust untuk situs ini. Izinkan agar cetak otomatis dapat berjalan.</p>`;
    page.appendChild(panel);
    const select = panel.querySelector('#qzPrinterSelect'), status = panel.querySelector('#qzStatus');
    const fill = async () => {
      status.textContent = 'Menghubungkan ke QZ Tray…';
      try {
        const names = await printers(), selected = get().printer || (await window.qz.printers.getDefault());
        select.innerHTML = `<option value="">Pilih printer</option>${names.map(name => `<option value="${String(name).replace(/"/g, '&quot;')}">${clean(name)}</option>`).join('')}`;
        select.value = selected || ''; if (select.value) save({printer: select.value});
        status.textContent = `Terhubung ke QZ Tray${select.value ? ' · ' + select.value : ''}.`;
      } catch (error) { status.textContent = error.message || 'QZ Tray tidak terhubung. Pastikan aplikasi QZ Tray sedang berjalan.'; }
    };
    panel.querySelector('#qzConnect').onclick = fill;
    select.onchange = () => { save({printer:select.value}); status.textContent = select.value ? `Printer dipilih: ${select.value}.` : 'Pilih printer untuk cetak otomatis.'; };
    panel.querySelector('#qzAuto').onchange = event => save({auto:event.target.checked});
    if (settings.printer) fill();
  }
  window.nesboothQzPrintReceipt = printReceipt;
  window.nesboothQzConnect = connect;
  window.addEventListener('load', addSettingsPanel);
})();
