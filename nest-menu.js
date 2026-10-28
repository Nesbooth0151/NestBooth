(() => {
  const menuVersion = 'nest-menu-2026-10-29';
  const nestMenu = [
    ['Nestlé Blackcurrant', 'Minuman', 5000, 100, '🥤'],
    ['Nestlé Milo', 'Minuman', 11000, 100, '🥤'],
    ['Nestea Lemon Tea', 'Minuman', 5000, 100, '🍋'],
    ['Nestlé Lemonade', 'Minuman', 5000, 100, '🍋'],
    ['Nescafé Caffe Latte', 'Minuman', 9000, 100, '☕'],
    ['Nescafé Ice Roast', 'Minuman', 5000, 100, '🧊'],
    ['NESLO', 'Minuman', 13000, 100, '🥤']
  ];
  const options = {
    'Nescafé Caffe Latte': [{label: 'Normal', price: 9000}, {label: 'Strong', price: 11000}],
    'Nescafé Ice Roast': [
      {label: '1 Shot Dingin', price: 5000}, {label: '2 Shot Dingin', price: 7000}, {label: '3 Shot Dingin', price: 9000},
      {label: '1 Shot Panas', price: 5000}, {label: '2 Shot Panas', price: 7000}, {label: '3 Shot Panas', price: 9000}
    ]
  };

  appSettings.storeName = 'NesBooth';
  localStorage.setItem('kasirkita-settings', JSON.stringify(appSettings));
  document.querySelector('.brand').childNodes[1].textContent = ' NesBooth';
  const storeNameInput = document.getElementById('settingStoreName');
  if (storeNameInput) storeNameInput.value = 'NesBooth';

  if (localStorage.getItem('nestbooth-menu-version') !== menuVersion) {
    products.splice(0, products.length, ...nestMenu.map(item => [...item]));
    cart = [];
    localStorage.setItem('kasirkita-menu', JSON.stringify(products));
    localStorage.setItem('nestbooth-menu-version', menuVersion);
  }
  // Menu baru tidak boleh memakai resep dari daftar menu lama.
  recipes.splice(0, recipes.length, ...products.map(() => ({})));
  document.querySelectorAll('.cat').forEach(button => {
    if (!['Semua', 'Minuman'].includes(button.dataset.cat)) button.remove();
  });
  if (typeof renderMenuEditor === 'function') renderMenuEditor(0);
  if (typeof refreshStockAdmin === 'function') refreshStockAdmin();
  renderProducts(); renderCart();

  const style = document.createElement('style');
  style.textContent = '.drink-choice{position:fixed;inset:0;z-index:120;background:#071a2c99;display:grid;place-items:center;padding:20px}.drink-choice article{width:min(420px,100%);background:#fff;border-radius:12px;padding:22px;color:#172b4d}.drink-choice h2{margin:0 0 6px}.drink-choice p{color:#718096;margin:0 0 17px}.drink-choice button{width:100%;text-align:left;margin:7px 0;border:1px solid #d8e1eb;border-radius:8px;padding:13px;background:#fff;font:inherit;font-weight:700;cursor:pointer}.drink-choice button:hover{border-color:#1677ff;background:#f2f8ff}.drink-choice .choice-cancel{text-align:center;background:#edf2f7;color:#334e68;border:0;margin-top:13px}';
  document.head.appendChild(style);
  const baseAdd = add;
  const rupiah = value => 'Rp' + Number(value).toLocaleString('id-ID');
  function addWithOption(index, option) {
    let item = cart.find(entry => entry.i === index && entry.variant === option.label);
    if (item) item.q += 1;
    else cart.push({i: index, q: 1, variant: option.label, unitPrice: option.price});
    renderCart();
  }
  function showOptions(index, productOptions) {
    document.getElementById('drinkChoice')?.remove();
    const dialog = document.createElement('div');
    dialog.id = 'drinkChoice'; dialog.className = 'drink-choice';
    const name = products[index][0];
    dialog.innerHTML = `<article><h2>${name}</h2><p>Pilih pesanan:</p>${productOptions.map((option, position) => `<button type="button" data-option="${position}">${option.label}<span style="float:right;color:#1677ff">${rupiah(option.price)}</span></button>`).join('')}<button type="button" class="choice-cancel">Batal</button></article>`;
    document.body.appendChild(dialog);
    dialog.querySelectorAll('[data-option]').forEach(button => button.onclick = () => { addWithOption(index, productOptions[Number(button.dataset.option)]); dialog.remove(); });
    dialog.querySelector('.choice-cancel').onclick = () => dialog.remove();
  }
  add = function(index) {
    const productOptions = options[products[index]?.[0]];
    if (productOptions) showOptions(index, productOptions); else baseAdd(index);
  };
})();
