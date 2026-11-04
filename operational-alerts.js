// Notifikasi operasional Dashboard. Data selalu dibaca dari server supaya semua
// perangkat melihat status yang sama dan tidak bergantung pada cache browser.
(() => {
  const money = value => `Rp${Number(value || 0).toLocaleString('id-ID')}`;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'}[char]));
  const age = value => {
    const milliseconds = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return '';
    const minutes = Math.floor(milliseconds / 60000);
    if (minutes < 1) return 'baru saja';
    if (minutes < 60) return `${minutes} menit lalu`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours} jam lalu` : `${Math.floor(hours / 24)} hari lalu`;
  };

  function panel() {
    const dashboard = document.getElementById('dashboard');
    if (!dashboard) return null;
    let section = document.getElementById('operationalAlerts');
    if (section) return section;
    section = document.createElement('section');
    section.id = 'operationalAlerts';
    section.style.cssText = 'margin:18px 0;padding:18px;border:1px solid #d9e5f3;border-radius:14px;background:#fff;box-shadow:0 4px 16px rgba(16,48,82,.05)';
    const reference = dashboard.querySelector('.two-col');
    if (reference) dashboard.insertBefore(section, reference);
    else dashboard.append(section);
    return section;
  }

  function render(data) {
    const target = panel();
    if (!target) return;
    const stock = Array.isArray(data.outOfStock) ? data.outOfStock : [];
    const shifts = Array.isArray(data.openShifts) ? data.openShifts : [];
    const qris = Array.isArray(data.pendingQris) ? data.pendingQris : [];
    const allClear = !stock.length && !shifts.length && !qris.length;
    const group = (type, title, subtitle, items) => items.length ? `
      <div style="border:1px solid ${type === 'danger' ? '#ffd3d3' : '#ffe1aa'};background:${type === 'danger' ? '#fff7f7' : '#fffaf0'};border-radius:10px;padding:12px;min-width:220px;flex:1">
        <div style="font-weight:800;color:${type === 'danger' ? '#b42318' : '#9a5b00'}">${title} <span style="float:right;border-radius:999px;padding:2px 8px;background:#fff;font-size:12px">${items.length}</span></div>
        <div style="font-size:12px;color:#63748a;margin:4px 0 9px">${subtitle}</div>
        <div style="display:grid;gap:6px">${items.join('')}</div>
      </div>` : '';
    const stockItems = stock.map(item => `<div style="font-size:13px;color:#263850">${escapeHtml(item.name)} <span style="color:#b42318;font-weight:700">habis</span></div>`);
    const shiftItems = shifts.map(item => `<div style="font-size:13px;color:#263850"><b>${escapeHtml(item.cashier_name || 'Kasir')}</b> · dibuka ${escapeHtml(age(item.opened_at))}</div>`);
    const qrisItems = qris.map(item => `<div style="font-size:13px;color:#263850"><b>${escapeHtml(item.order_id)}</b> · ${money(item.gross_amount)} <span style="color:#9a5b00">(${escapeHtml(age(item.created_at))})</span></div>`);
    target.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;justify-content:space-between;margin-bottom:${allClear ? '0' : '14px'};flex-wrap:wrap">
        <div><div style="font-weight:800;font-size:17px;color:#102f52">Notifikasi Operasional ${allClear ? '' : `<span style="display:inline-block;background:#e9f2ff;color:#1267e8;border-radius:999px;padding:2px 8px;font-size:12px">${Number(data.total || 0)}</span>`}</div><div style="color:#63748a;font-size:13px;margin-top:3px">Pantau kondisi toko yang perlu ditindaklanjuti.</div></div>
        <button type="button" id="refreshOperationalAlerts" style="border:1px solid #cddceb;background:#fff;color:#164d85;padding:8px 11px;border-radius:8px;font-weight:700;cursor:pointer">↻ Muat ulang</button>
      </div>
      ${allClear ? '<div style="padding:12px 14px;border-radius:9px;background:#f2fbf6;color:#167244;font-size:14px">✓ Tidak ada notifikasi operasional. Stok, shift, dan QRIS dalam kondisi aman.</div>' : `<div style="display:flex;gap:12px;flex-wrap:wrap">${group('danger', 'Stok habis', 'Segera restok bahan berikut.', stockItems)}${group('warning', 'Shift belum ditutup', 'Tutup dan rekap setelah operasional selesai.', shiftItems)}${group('warning', 'QRIS tertunda', 'Periksa pembayaran yang belum berhasil.', qrisItems)}</div>`}`;
    target.querySelector('#refreshOperationalAlerts')?.addEventListener('click', load);
  }

  let loading = false;
  async function load() {
    if (loading || !document.getElementById('dashboard')) return;
    loading = true;
    try {
      const response = await fetch('/api/operational-alerts', {cache: 'no-store'});
      if (!response.ok) throw new Error('Notifikasi belum dapat dimuat');
      render(await response.json());
    } catch (error) {
      const target = panel();
      if (target && !target.dataset.loaded) target.innerHTML = `<div style="color:#63748a;font-size:13px">Notifikasi operasional belum dapat dimuat. Tekan Dashboard atau muat ulang halaman.</div>`;
    } finally {
      const target = document.getElementById('operationalAlerts');
      if (target) target.dataset.loaded = 'true';
      loading = false;
    }
  }

  window.addEventListener('nesbooth-cloud-updated', load);
  window.addEventListener('focus', load);
  setTimeout(load, 700);
  setInterval(load, 30000);
})();
