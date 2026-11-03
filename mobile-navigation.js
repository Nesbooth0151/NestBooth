(() => {
  const style = document.createElement('style');
  style.textContent = `
    .mobile-nav{display:none}
    @media(max-width:900px){
      .mobile-nav{display:flex;gap:8px;overflow-x:auto;padding:0 0 14px;margin:-5px 0 10px;scrollbar-width:none}
      .mobile-nav::-webkit-scrollbar{display:none}
      .mobile-nav button{flex:0 0 auto;border:1px solid #d6e1ec;background:#fff;color:#38536d;border-radius:20px;padding:8px 12px;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
      .mobile-nav button.active{background:#1677ff;border-color:#1677ff;color:#fff}
    }
  `;
  document.head.appendChild(style);

  const desktopButtons = [...document.querySelectorAll('.nav button')];
  const top = document.querySelector('.top');
  if (!top || !desktopButtons.length) return;

  const nav = document.createElement('nav');
  nav.className = 'mobile-nav';
  nav.setAttribute('aria-label', 'Menu utama');
  desktopButtons.forEach((desktopButton) => {
    // Login sudah menyembunyikan menu yang tidak boleh dipakai peran ini.
    // Jangan membuat salinan menu tersembunyi di navigasi layar kecil.
    if (desktopButton.style.display === 'none') return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.page = desktopButton.dataset.page;
    button.textContent = desktopButton.textContent.replace(/^\S+\s+/, '');
    if (desktopButton.classList.contains('active')) button.classList.add('active');
    button.addEventListener('click', () => desktopButton.click());
    nav.appendChild(button);
  });
  top.insertAdjacentElement('afterend', nav);

  desktopButtons.forEach((desktopButton) => {
    desktopButton.addEventListener('click', () => {
      nav.querySelectorAll('button').forEach((button) => {
        button.classList.toggle('active', button.dataset.page === desktopButton.dataset.page);
      });
    });
  });
})();
