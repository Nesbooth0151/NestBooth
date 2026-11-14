// Tab Kasir hanya dapat dibuka jika ada shift yang sedang aktif.
// Berlaku di desktop dan navigasi tablet/mobile.
(() => {
  if (!/\.onrender\.com$/i.test(location.hostname)) return;

  let bypass = false;
  let checking = false;

  const notify = message => {
    if (typeof show === 'function') show(message);
    else window.alert(message);
  };
  const shiftButton = () => document.querySelector('.nav button[data-page="shift"], .mobile-nav button[data-page="shift"]');
  const goToShift = () => shiftButton()?.click();
  const hasOpenShift = async () => {
    const response = await fetch('/api/shifts', {headers: {'Content-Type': 'application/json'}});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Status shift tidak dapat dimuat');
    return Boolean(data.openShift);
  };

  async function openCashierWhenAllowed(button) {
    if (checking) return;
    checking = true;
    try {
      if (await hasOpenShift()) {
        bypass = true;
        button.click();
        bypass = false;
      } else {
        notify('Buka shift terlebih dahulu sebelum mengakses Kasir.');
        goToShift();
      }
    } catch (error) {
      notify(error.message || 'Status shift tidak dapat dimuat.');
    } finally {
      bypass = false;
      checking = false;
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('.nav button[data-page="kasir"], .mobile-nav button[data-page="kasir"]');
    if (!button || bypass) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openCashierWhenAllowed(button);
  }, true);

  // Halaman awal sebelumnya selalu Kasir. Saat login tanpa shift, langsung
  // pindahkan ke halaman Shift agar pengguna tahu langkah yang diperlukan.
  setTimeout(async () => {
    const activePage = document.querySelector('.page.active');
    if (activePage?.id !== 'kasir') return;
    try {
      if (!(await hasOpenShift())) goToShift();
    } catch { /* Pesan koneksi tampil ketika pengguna mencoba membuka Kasir. */ }
  }, 250);
})();
