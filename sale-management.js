// Aksi transaksi dijalankan melalui fungsi database atomik agar penjualan dan antrean konsisten.
(() => {
  if (!/\.onrender\.com$/i.test(location.hostname)) return;
  document.addEventListener('click', async event => {
    const button = event.target.closest('.sale-action');
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    let payment_method = null;
    if (action === 'cancel' && !confirm('Batalkan transaksi ini? Nilainya tidak lagi dihitung sebagai penjualan dan antreannya akan ditutup.')) return;
    if (action === 'refund' && !confirm('Tandai transaksi ini sebagai refund? Nilainya tidak lagi dihitung sebagai penjualan dan antreannya akan ditutup.')) return;
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
        body: JSON.stringify({id, action, payment_method})
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
