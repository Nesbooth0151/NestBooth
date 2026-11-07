// Link layar TV hanya diberikan setelah pengguna POS terautentikasi.
// Kunci berada pada URL TV agar perangkat TV tidak perlu login ke POS.
(() => {
  const link = document.getElementById('tvDisplayLink');
  if (!link || !/\.onrender\.com$/i.test(location.hostname)) return;
  async function loadTvLink() {
    try {
      const response = await fetch('/api/tv-link', {cache: 'no-store'});
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) throw new Error(data.error || 'Link TV belum tersedia');
      link.href = data.url;
      link.title = 'Link khusus layar TV sudah siap';
    } catch (error) {
      link.title = 'Atur TV_DISPLAY_KEY di Render untuk mengaktifkan layar TV';
    }
  }
  setTimeout(loadTvLink, 500);
  document.addEventListener('pos-session-ready', loadTvLink);
})();
