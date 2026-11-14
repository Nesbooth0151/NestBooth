// Rekap kasir per shift yang tersimpan di database pusat.
(() => {
  if (!/\.onrender\.com$/i.test(location.hostname)) return;
  const root = document.getElementById('shiftContent');
  if (!root) return;
  const shiftStyle = document.createElement('style');
  shiftStyle.textContent = `
    .shift-expense-form{margin-top:22px;padding:20px!important;background:linear-gradient(135deg,#fff8ee,#fffdf9)!important;border:1px solid #fed7aa!important;border-radius:12px!important;display:grid!important;grid-template-columns:repeat(12,minmax(0,1fr))!important;gap:14px!important;align-items:end!important}
    .shift-expense-form .shift-form-heading{grid-column:1/-1;padding-bottom:12px;border-bottom:1px solid #fed7aa}.shift-expense-form .shift-form-heading b{font-size:16px;color:#8b3a00}.shift-expense-form label{min-width:0}.shift-expense-form>label:nth-of-type(1){grid-column:span 3}.shift-expense-form>label:nth-of-type(2){grid-column:span 2}.shift-expense-form>label:nth-of-type(3){grid-column:span 4}.shift-expense-form>label:nth-of-type(4){grid-column:span 3;align-self:center;padding:10px 0}.shift-expense-form>label:nth-of-type(5){grid-column:span 5}.shift-expense-form>label:nth-of-type(6){grid-column:span 2}.shift-expense-form>button{grid-column:span 3;min-height:40px}.shift-expense-form input,.shift-expense-form select,.shift-close-form input{width:100%;box-sizing:border-box}
    .shift-expense-history{margin-top:16px;padding:0 2px}.shift-expense-history table{min-width:760px}.shift-close-form{margin-top:22px!important;padding:20px!important;background:#fffdf7!important;border:1px solid #f1d391!important;border-radius:12px!important;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:14px!important;align-items:end!important}.shift-close-form>button{height:40px}.shift-history{border-top:1px solid #e4eaf1;margin-top:28px;padding-top:20px}
    @media(max-width:820px){.shift-expense-form{grid-template-columns:repeat(2,minmax(0,1fr))!important}.shift-expense-form>label:nth-of-type(n){grid-column:span 1}.shift-expense-form>label:nth-of-type(3),.shift-expense-form>label:nth-of-type(4),.shift-expense-form>label:nth-of-type(5),.shift-expense-form>button{grid-column:1/-1}.shift-close-form{grid-template-columns:1fr!important}.shift-close-form>button{grid-column:1/-1}}
  `;
  document.head.appendChild(shiftStyle);
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
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let data = null;

  const recentRows = shifts => shifts.length ? shifts.map(shift => {
    const difference = Number(shift.cash_difference || 0);
    return `<tr><td>${date(shift.opened_at)}</td><td>${safe(shift.cashier_name)}</td><td>${money(shift.opening_cash)}</td><td>${money(shift.cash_sales)}</td><td>${money(shift.qris_sales)}</td><td>${money(shift.cash_expenses)}</td><td>${money(shift.counted_cash)}</td><td style="font-weight:750;color:${difference === 0 ? '#078354' : '#b54708'}">${difference > 0 ? '+' : ''}${money(difference)}</td><td><button class="btn ghost shift-detail" data-id="${shift.id}" type="button">Detail</button></td></tr>`;
  }).join('') : '<tr><td colspan="9" class="muted" style="text-align:center;padding:18px">Belum ada shift yang ditutup.</td></tr>';

  const render = () => {
    const open = data?.openShift;
    if (!open) {
      root.innerHTML = `<h2>Buka Shift Kasir</h2><p class="muted">Masukkan uang tunai awal sebelum mulai menerima transaksi. Semua transaksi berikutnya akan masuk ke shift ini.</p><form id="openShiftForm" style="display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin:18px 0"><label style="display:grid;gap:6px;font-weight:650">Kasir<input id="shiftCashier" value="${cashier()}" required style="height:38px;border:1px solid #e4eaf1;border-radius:7px;padding:0 10px"></label><label style="display:grid;gap:6px;font-weight:650">Kas awal (Rp)<input id="openingCash" type="number" min="0" value="0" required style="height:38px;border:1px solid #e4eaf1;border-radius:7px;padding:0 10px"></label><button class="btn" type="submit">Buka Shift</button></form>${historyMarkup()}`;
      document.getElementById('openShiftForm').addEventListener('submit', openShift);
      bindDetailButtons();
      return;
    }
    const stockOptions = (window.nesboothCloudState?.materials || []).map(material => `<option value="${material.id}" data-unit="${safe(material.unit)}">${safe(material.name)} (${safe(material.unit)})</option>`).join('');
    root.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:start;gap:12px;flex-wrap:wrap"><div><h2 style="margin:0">Shift Aktif</h2><p class="muted" style="margin:5px 0 0">Kasir: <b>${safe(open.cashier_name)}</b> · Dibuka ${date(open.opened_at)}</p></div><span class="badge process">Sedang berjalan</span></div><div class="dash-grid" style="margin-top:18px"><div class="card stat"><div class="label">Kas Awal</div><div class="value">${money(open.opening_cash)}</div></div><div class="card stat"><div class="label">Penjualan Tunai</div><div class="value">${money(open.cash_sales)}</div><div class="up">${open.transaction_count} transaksi shift ini</div></div><div class="card stat"><div class="label">Pengeluaran Kas</div><div class="value" style="color:#b54708">−${money(open.cash_expenses)}</div></div><div class="card stat"><div class="label">Kas Seharusnya</div><div class="value">${money(open.expected_cash)}</div><div class="muted">Kas awal + tunai − pengeluaran</div></div></div><form id="cashExpenseForm" class="shift-expense-form"><div class="shift-form-heading"><b>Pengeluaran Kas</b><div class="muted" style="font-size:12px;margin-top:4px">Untuk belanja bahan, centang tambah stok agar uang kas dan stok diperbarui bersamaan.</div></div><label style="display:grid;gap:6px;font-weight:650">Kategori<select id="expenseCategory" style="height:38px;border:1px solid #e4eaf1;border-radius:7px;padding:0 10px"><option>Belanja bahan baku</option><option>Operasional</option><option>Transportasi</option><option>Lainnya</option></select></label><label style="display:grid;gap:6px;font-weight:650">Nominal (Rp)<input id="expenseAmount" type="number" min="1" required placeholder="Contoh: 20000" style="height:38px;border:1px solid #e4eaf1;border-radius:7px;padding:0 10px"></label><label style="display:grid;gap:6px;font-weight:650">Keterangan<input id="expenseDescription" maxlength="300" required placeholder="Contoh: beli es dan air" style="height:38px;border:1px solid #e4eaf1;border-radius:7px;padding:0 10px"></label><label style="display:flex;gap:7px;align-items:center;font-weight:650"><input id="expenseAddStock" type="checkbox"> Tambahkan ke stok</label><label id="expenseMaterialWrap" style="display:none;gap:6px;font-weight:650">Bahan<select id="expenseMaterial" style="height:38px;border:1px solid #e4eaf1;border-radius:7px;padding:0 10px"><option value="">Pilih bahan</option>${stockOptions}</select></label><label id="expenseStockQtyWrap" style="display:none;gap:6px;font-weight:650">Jumlah masuk<input id="expenseStockQty" type="number" min="0.01" step="0.01" placeholder="Jumlah" style="height:38px;border:1px solid #e4eaf1;border-radius:7px;padding:0 10px"><small id="expenseStockUnit" class="muted"></small></label><button class="btn" type="submit" style="background:#b54708">Catat Pengeluaran</button></form>${expensesMarkup(open.expenses || [])}<form id="closeShiftForm" class="shift-close-form"><label style="display:grid;gap:6px;font-weight:650">Kas fisik akhir (Rp)<input id="countedCash" type="number" min="0" placeholder="Hitung uang di laci" required style="height:38px;border:1px solid #e4eaf1;border-radius:7px;padding:0 10px"></label><label style="display:grid;gap:6px;font-weight:650">Catatan <span class="muted" style="font-weight:400">(opsional)</span><input id="shiftNotes" maxlength="300" placeholder="Contoh: selisih uang kecil" style="height:38px;border:1px solid #e4eaf1;border-radius:7px;padding:0 10px"></label><button class="btn" type="submit" style="background:#b54708">Tutup & Rekap Shift</button></form>${historyMarkup()}`;
    const addStock = document.getElementById('expenseAddStock'), material = document.getElementById('expenseMaterial'), materialWrap = document.getElementById('expenseMaterialWrap'), quantityWrap = document.getElementById('expenseStockQtyWrap'), unit = document.getElementById('expenseStockUnit');
    const toggleStock = () => { materialWrap.style.display = addStock.checked ? 'grid' : 'none'; quantityWrap.style.display = addStock.checked ? 'grid' : 'none'; };
    addStock.addEventListener('change', toggleStock); material.addEventListener('change', () => { unit.textContent = material.selectedOptions[0]?.dataset.unit || ''; }); toggleStock();
    document.getElementById('cashExpenseForm').addEventListener('submit', addExpense);
    document.getElementById('closeShiftForm').addEventListener('submit', closeShift);
    bindDetailButtons();
  };

  const expensesMarkup = expenses => `<div class="shift-expense-history" style="overflow:auto"><table><tr><th>Waktu</th><th>Kategori</th><th>Keterangan</th><th>Stok Masuk</th><th>Petugas</th><th>Nominal</th></tr>${expenses.length ? expenses.map(expense => `<tr><td>${date(expense.created_at)}</td><td>${safe(expense.category)}</td><td>${safe(expense.description)}</td><td>${expense.material ? `+${Number(expense.stock_quantity).toLocaleString('id-ID')} ${safe(expense.material.unit)} ${safe(expense.material.name)}` : '—'}</td><td>${safe(expense.created_by)}</td><td style="font-weight:750;color:#b54708">−${money(expense.amount)}</td></tr>`).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;padding:14px">Belum ada pengeluaran kas pada shift ini.</td></tr>'}</table></div>`;
  const historyMarkup = () => `<section class="shift-history"><h2>Riwayat Shift</h2><div style="overflow:auto"><table style="min-width:980px"><tr><th>Dibuka</th><th>Kasir</th><th>Kas Awal</th><th>Tunai</th><th>QRIS</th><th>Keluar</th><th>Kas Fisik</th><th>Selisih</th><th></th></tr>${recentRows(data?.recent || [])}</table></div></section>`;

  function bindDetailButtons() {
    root.querySelectorAll('.shift-detail').forEach(button => button.addEventListener('click', () => showDetail(button.dataset.id)));
  }
  async function showDetail(id) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:18px;background:#102a4388';
    modal.innerHTML = '<div class="card" style="width:min(1000px,100%);max-height:90vh;overflow:auto;padding:22px"><h2>Detail Shift</h2><p class="muted">Memuat detail shift…</p></div>';
    document.body.appendChild(modal);
    const close = () => modal.remove(); modal.addEventListener('click', event => { if (event.target === modal) close(); });
    try {
      const detail = await request(`/api/shifts/detail?id=${encodeURIComponent(id)}`);
      const shift = detail.shift || {}, sales = detail.sales || [], expenses = detail.expenses || [];
      const paid = sales.filter(sale => sale.payment_status === 'paid');
      const transactionRows = sales.length ? sales.map(sale => `<tr><td>${date(sale.created_at)}</td><td>${safe(sale.receipt_number)}</td><td>${(sale.items || []).map(item => `${Number(item.qty || 0)}× ${safe(String(item.name || '').split(' — ')[0])}`).join('<br>')}</td><td>${safe(sale.payment_method)}</td><td>${money(sale.total)}</td><td><span class="badge ${sale.payment_status === 'paid' ? 'ready' : 'wait'}">${safe(sale.payment_status === 'paid' ? 'Lunas' : sale.payment_status)}</span></td></tr>`).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;padding:16px">Tidak ada transaksi pada shift ini.</td></tr>';
      const expenseRows = expenses.length ? expenses.map(expense => `<tr><td>${date(expense.created_at)}</td><td>${safe(expense.category)}</td><td>${safe(expense.description)}</td><td>${expense.material ? `+${Number(expense.stock_quantity).toLocaleString('id-ID')} ${safe(expense.material.unit)} ${safe(expense.material.name)}` : '—'}</td><td>${safe(expense.created_by)}</td><td style="color:#b54708;font-weight:750">−${money(expense.amount)}</td></tr>`).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;padding:16px">Tidak ada pengeluaran kas.</td></tr>';
      modal.firstElementChild.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px;align-items:start"><div><h2 style="margin:0">Detail Shift</h2><p class="muted" style="margin:5px 0 0">Kasir: <b>${safe(shift.cashier_name)}</b> · ${date(shift.opened_at)}</p></div><button id="closeShiftDetail" class="btn ghost" type="button">Tutup</button></div><div class="dash-grid" style="margin:16px 0"><div class="card stat"><div class="label">Kas Awal</div><div class="value">${money(shift.opening_cash)}</div></div><div class="card stat"><div class="label">Tunai</div><div class="value">${money(shift.cash_sales)}</div></div><div class="card stat"><div class="label">QRIS</div><div class="value">${money(shift.qris_sales)}</div></div><div class="card stat"><div class="label">Pengeluaran</div><div class="value" style="color:#b54708">−${money(shift.cash_expenses)}</div></div><div class="card stat"><div class="label">Kas Seharusnya</div><div class="value">${money(shift.expected_cash)}</div></div><div class="card stat"><div class="label">Selisih</div><div class="value">${money(shift.cash_difference)}</div></div></div><h3>Transaksi (${paid.length} lunas)</h3><div style="overflow:auto"><table style="min-width:760px"><tr><th>Waktu</th><th>No. Struk</th><th>Item</th><th>Bayar</th><th>Total</th><th>Status</th></tr>${transactionRows}</table></div><h3 style="margin-top:22px">Pengeluaran Kas</h3><div style="overflow:auto"><table style="min-width:780px"><tr><th>Waktu</th><th>Kategori</th><th>Keterangan</th><th>Stok Masuk</th><th>Petugas</th><th>Nominal</th></tr>${expenseRows}</table></div>${shift.notes ? `<p class="muted" style="margin-top:16px"><b>Catatan tutup shift:</b> ${safe(shift.notes)}</p>` : ''}`;
      modal.querySelector('#closeShiftDetail').onclick = close;
    } catch (error) { modal.firstElementChild.innerHTML = `<h2>Detail Shift</h2><p class="muted">${safe(error.message || 'Detail shift tidak dapat dimuat.')}</p><button id="closeShiftDetail" class="btn ghost" type="button">Tutup</button>`; modal.querySelector('#closeShiftDetail').onclick = close; }
  }

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
  async function addExpense(event) {
    event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true; button.textContent = 'Menyimpan…';
    try {
      const addStock = document.getElementById('expenseAddStock').checked;
      await request('/api/cash-expenses', {method:'POST', body:JSON.stringify({shift_id:data.openShift.id, category:document.getElementById('expenseCategory').value, amount:Number(document.getElementById('expenseAmount').value), description:document.getElementById('expenseDescription').value, material_id:addStock ? document.getElementById('expenseMaterial').value : null, stock_quantity:addStock ? Number(document.getElementById('expenseStockQty').value) : null})});
      if (addStock) await window.nesboothCloudReload?.();
      show('Pengeluaran kas berhasil dicatat.'); await load();
    } catch (error) { show(error.message || 'Pengeluaran kas tidak dapat disimpan.'); button.disabled = false; button.textContent = 'Catat Pengeluaran'; }
  }
  // Halaman Shift tidak memakai pembaruan otomatis. Formulir kas awal,
  // pengeluaran, dan tutup shift harus tetap utuh sampai petugas menekan
  // tombol simpan sendiri.
  load();
})();
