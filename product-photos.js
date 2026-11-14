(() => {
  const photos = {
    'NESLO': 'assets/menu/01-Neslo.jpg',
    'Nestea Lemon Tea': 'assets/menu/02-Nestea.jpg',
    'Nestlé Lemonade': 'assets/menu/03-Lemonade.jpg',
    'Nestlé Blackcurrant': 'assets/menu/04-Blackcurrant.jpg',
    'Nestlé Milo': 'assets/menu/05-Milo.jpg',
    'Nescafé Caffe Latte': 'assets/menu/06-Coffee.jpg',
    'Nescafé Ice Roast': 'assets/menu/07-Ice-Roast.jpg'
  };
  const style = document.createElement('style');
  style.textContent = '.product{padding:0;overflow:hidden}.product-photo{display:block;width:100%;height:128px;object-fit:cover;background:#eef3f8}.product-details{padding:11px 12px 12px}.product .pname{line-height:1.3}';
  document.head.appendChild(style);
  renderProducts = function () {
    const keyword = search.value.toLowerCase();
    const visible = products.filter(product => (filter === 'Semua' || product[1] === filter) && product[0].toLowerCase().includes(keyword));
    productsEl.innerHTML = visible.map((product, position) => {
      const index = products.indexOf(product);
      const photo = photos[product[0]];
      return `<div class="product" onclick="add(${index})">${photo ? `<img class="product-photo" src="${photo}" alt="${product[0]}" width="360" height="480" decoding="async" ${position > 3 ? 'loading="lazy"' : ''}>` : ''}<div class="product-details"><div class="pname">${product[0]}</div><div class="price">${money(product[2])}</div><div class="stock">Menggunakan bahan baku</div></div></div>`;
    }).join('') || '<p class="muted">Produk tidak ditemukan.</p>';
  };
  search.oninput = renderProducts;
  renderProducts();
})();
