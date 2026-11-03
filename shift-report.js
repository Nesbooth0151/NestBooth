// Rekap kasir per shift yang tersimpan di database pusat.
(() => {
  if (!/\.onrender\.com$/i.test(location.hostname)) return;
  const root = document.getElementById('shiftContent');
  if (!root) return;
  const money = value => 'Rp' + Number(value || 0).toLocaleString('id-ID');
  const session = () => { try { return JSON.parse(localStorage.getItem('nesbooth-pos-session') || '{}'); } catch { return {}; } };
  const cashier = () => session().name || 'Kasir';
  const request = async (url, options = {}) => {
    const response = await fetch(url, {headers: {'Content-Type': 'application/json'}, ...options});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Rekap shift tidak dapat diproses');
    return data;
  };
  const date = value => new Date(value).toLocaleString('id-ID', {timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'});
  let data = null;

  const recentRows = shifts => shifts.length ? shifts.map(shift => {
    const difference = Number(shift.cash_difference || 0);
    return `<tr><td>${date(shift.opened_at)}</td><td>${shift.cashier_name}</td><td>${money(shift.opening_cash)}</td><td>${money(shift.cash_sales)}</td><td>${money(shift.qris_sales)}</td><td>${money(shift.counted_cash)}</td><td style="font-weight:750;color:${difference === 0 ? '#078354' : '#b54708'}">${difference > 0 ? '+' : ''}${money(difference)}</td></tr>`;
  }).join('') : '<tr><td colspan="7" class="muted" style="text-align:center;padding:18px">Belum ada shift yang ditutup.</td></tr>';

  const render = () => {
    const open = data?.openShift;
    if (!open) {
      root.innerHTML = `<h2>Buka Shift Kasir</h2><p class="muted">Masukkan uang tunai awal sebelum mulai menerima transaksi. Semua transaksi berikutnya akan masuk ke shift ini.</p><form id="openShiftForm" style="display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin:18px 0"><label style="display:grid;gap:6px;font-weight:650">Kasir<input id="shiftCashier" value="${cashier()}" required style="height:38px;border:1px solid #e4eaf1;border-radius:7px;padding:0 10px"></label><label style="display:grid;gap:6px;font-weight:650">Kas awal (Rp)<input id="openingCash" type="number" min="0" value="0" required style="height:38px;border:1px solid #e4eaf1;border-radius:7px;padding:0 10px"></label><button class="btn" type="submit">Buka Shift</button></form>${historyMarkup()}`;
      document.getElementById('openShiftForm').addEventListener('submit', openShift);
      return;
    }
    root.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:start;gap:12px;flex-wrap:wrap"><div><h2 style="margin:0">Shift Aktif</h2><p class="muted" style="margin:5px 0 0">Kasir: <b>${open.cashier_name}</b> · Dibuka ${date(open.opened_at)}</p></div><span class="badge process">Sedang berjalan</span></div><div class="dash-grid" style="margin-top:18px"><div class="card stat"><div class="label">Kas Awal</div><div class="value">${money(open.opening_cash)}</div></div><div class="card stat"><div class="label">Penjualan Tunai</div><div class="value">${money(open.cash_sales)}</div><div class="up">${open.transaction_count} transaksi shift ini</div></div><div class="card stat"><div class="label">Penjualan QRIS</div><div class="value">${money(open.qris_sales)}</div></div><div class="card stat"><div class="label">Kas Seharusnya</div><div class="value">${money(open.expected_cash)}</div><div class="muted">Kas awal + tunai</div></div></div><form id="closeShiftForm" style="margin-top:20px;padding:15px;background:#fffaf0;border:1px solid #f1d391;border-radius:10px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:end"><label style="display:grid;gap:6px;font-weight:650">Kas fisik akhir (Rp)<input id="countedCash" type="number" min="0" placeholder="Hitung uang di laci" required style="height:38px;border:1px solid #e4eaf1;border-radius:7px;padding:0 10px"></label><label style="display:grid;gap:6px;font-weight:650">Catatan <span class="muted" style="font-weight:400">(opsional)</span><input id="shiftNotes" maxlength="300" placeholder="Contoh: selisih uang kecil" style="height:38px;border:1px solid #e4eaf1;border-radius:7px;padding:0 10px"></label><button class="btn" type="submit" style="background:#b54708">Tutup & Rekap Shift</button></form>${historyMarkup()}`;
    document.getElementById('closeShiftForm').addEventListener('submit', closeShift);
  };

  const historyMarkup = () => `<hr style="border:0;border-top:1px solid #e4eaf1;margin:25px 0 16px"><h2>Riwayat Shift</h2><div style="overflow:auto"><table style="min-width:780px"><tr><th>Dibuka</th><th>Kasir</th><th>Kas Awal</th><th>Tunai</th><th>QRIS</th><th>Kas Fisik</th><th>Selisih</th></tr>${recentRows(data?.recent || [])}</table></div>`;

  async function load() {
    try { data = await request('/api/shifts'); render(); }
    catch (error) { root.innerHTML = `<h2>Rekap Shift</h2><p class="muted">${error.message || 'Data shift tidak dapat dimuat.'}</p>`; }
  }
  async function openShift(event) {
    event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true; button.textContent = 'Membuka...';
    try { await request('/api/shifts/open', {method: 'POST', body: JSON.stringify({cashier: document.getElementById('shiftCashier').value, opening_cash: Number(document.getElementById('openingCash').value)})}); show('Shift kasir berhasil dibuka.'); await load(); }
    catch (error) { show(error.message || 'Shift tidak dapat dibuka.'); button.disabled = false; button.textContent = 'Buka Shift'; }
  }
  async function closeShift(event) {
    event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true; button.textContent = 'Memproses...';
    try {
      const result = await request('/api/shifts/close', {method: 'POST', body: JSON.stringify({shift_id: data.openShift.id, cashier: cashier(), counted_cash: Number(document.getElementById('countedCash').value), notes: document.getElementById('shiftNotes').value})});
      const difference = Number(result.cash_difference || 0); show(`Shift ditutup. Selisih kas: ${difference > 0 ? '+' : ''}${money(difference)}.`); await load();
    } catch (error) { show(error.message || 'Shift tidak dapat ditutup.'); button.disabled = false; button.textContent = 'Tutup & Rekap Shift'; }
  }
  load(); setInterval(load, 30000);
})();
