// Aksi transaksi dijalankan melalui fungsi database atomik agar penjualan dan antrean konsisten.
(() => {
  if (!/\.onrender\.com$/i.test(location.hostname)) return;
  document.addEventListener('click', async event => {
    const button = event.target.closest('.sale-action');
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    let payment_method = null;
    let reason = null, staff_name = null;
    if (action === 'cancel' || action === 'refund') {
      const label = action === 'cancel' ? 'membatalkan' : 'merefund';
      if (!confirm(`Yakin ${label} transaksi ini? Transaksi tidak dihapus, nilainya tidak lagi dihitung sebagai penjualan, dan antrean akan ditutup.`)) return;
      reason = prompt(`Alasan ${action === 'cancel' ? 'pembatalan' : 'refund'}:`);
      if (reason === null) return;
      reason = reason.trim();
      if (reason.length < 3) { show('Alasan minimal 3 karakter.'); return; }
      try { staff_name = JSON.parse(localStorage.getItem('nesbooth-pos-session') || '{}').name || ''; } catch { staff_name = ''; }
      if (!staff_name) { staff_name = prompt('Nama petugas:') || ''; }
      if (staff_name.trim().length < 2) { show('Nama petugas wajib diisi.'); return; }
    }
    if (action === 'payment_method') {
      const answer = prompt('Metode pembayaran baru: ketik Tunai atau QRIS', 'Tunai');
      if (answer === null) return;
      payment_method = answer.trim().toLowerCase() === 'qris' ? 'QRIS' : answer.trim().toLowerCase() === 'tunai' ? 'Tunai' : '';
      if (!payment_method) { show('Metode pembayaran harus Tunai atau QRIS.'); return; }
    }
    const original = button.textContent; button.disabled = true; button.textContent = 'Memproses...';
    try {
      const response = await fetch('/api/sales/manage', {
        method: 'PUT', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id, action, payment_method, staff_name, reason})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Transaksi tidak dapat diperbarui');
      show(action === 'cancel' ? 'Transaksi dibatalkan.' : action === 'refund' ? 'Transaksi ditandai refund.' : 'Metode pembayaran diperbarui.');
      document.getElementById('applyOnlineReport')?.click();
      window.nesboothCloudReload?.();
    } catch (error) {
      show(error.message || 'Transaksi tidak dapat diperbarui.');
    } finally {
      button.disabled = false; button.textContent = original;
    }
  });
})();
