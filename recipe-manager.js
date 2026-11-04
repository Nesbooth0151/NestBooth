// Editor resep pusat. Resep ini dipakai server untuk memotong stok saat pembayaran berhasil.
(() => {
  if (!/\.onrender\.com$/i.test(location.hostname)) return;
  const page = document.querySelector('#produk .inventory-page') || document.getElementById('produk');
  if (!page) return;
  const box = document.createElement('div'); box.className = 'card inventory-card recipe-manager-card';
  box.innerHTML = `<div class="recipe-manager-head"><div><p class="inventory-eyebrow">RESEP PRODUK</p><h2>Resep Menu Online</h2><p class="muted">Pilih menu dan varian untuk melihat atau memperbarui bahan yang dipotong otomatis setiap porsi terjual.</p></div><span>Stok akan terpotong saat pembayaran berhasil.</span></div><div class="recipe-manager-body"><div class="recipe-sync"><span id="recipeSyncInfo">Memuat resep dari server...</span><button id="reloadRecipes" class="btn ghost" type="button">↻ Muat Ulang Resep</button></div><div class="recipe-manager-form"><label class="field">Menu<select id="recipeProduct"></select></label><label class="field">Varian<select id="recipeVariant"></select></label><label class="field">Bahan<select id="recipeMaterial"></select></label><label class="field">Jumlah per porsi<input id="recipeAmount" type="number" min="0.01" step="0.01" value="1"></label><button id="saveRecipe" class="btn" type="button">Simpan Resep</button></div><div id="recipeRows" class="muted">Memuat resep pusat...</div></div>`;
  page.appendChild(box);
  const productSelect = box.querySelector('#recipeProduct');
  const variantInput = box.querySelector('#recipeVariant');
  const materialSelect = box.querySelector('#recipeMaterial');
  const amountInput = box.querySelector('#recipeAmount');
  const rows = box.querySelector('#recipeRows');
  const syncInfo = box.querySelector('#recipeSyncInfo');
  const recipeStyle = document.createElement('style');
  recipeStyle.textContent = '.recipe-manager-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:22px 24px 18px;border-bottom:1px solid #e4eaf1;background:linear-gradient(105deg,#fff 0%,#f7fbff 100%)}.recipe-manager-head h2{margin:2px 0 6px;font-size:18px;color:#172b4d}.recipe-manager-head p{margin:0;line-height:1.55}.recipe-manager-head>span{max-width:245px;padding:10px 12px;border-radius:9px;background:#eaf4ff;color:#35607f;font-size:12px;line-height:1.5}.recipe-manager-body{padding:18px 24px 24px}.recipe-sync{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;color:#61758a;font-size:12px}.recipe-sync .btn{padding:7px 10px}.recipe-manager-form{display:grid;grid-template-columns:minmax(180px,1.2fr) minmax(160px,1fr) minmax(180px,1.2fr) minmax(130px,.7fr) auto;gap:12px;align-items:end;margin:0 0 18px;padding:16px;border:1px solid #dbeaff;border-radius:11px;background:#f7fbff}.recipe-manager-form .field{display:grid;gap:7px;font-weight:700;color:#38536d;font-size:13px}.recipe-manager-form input,.recipe-manager-form select{width:100%;height:40px;border:1px solid #d7e2ed;border-radius:8px;padding:0 11px;background:#fff;color:#172b4d;font:inherit}.recipe-manager-form .btn{height:40px;white-space:nowrap}.recipe-variant-list{display:grid;gap:14px}.recipe-variant-card{border:1px solid #e1eaf2;border-radius:10px;overflow:hidden}.recipe-variant-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 14px;background:#f7fbff;border-bottom:1px solid #e1eaf2;color:#173b60}.recipe-variant-head b{font-size:14px}.recipe-variant-head span{font-size:12px;color:#61758a}.recipe-variant-card table{margin:0}.recipe-variant-card td,.recipe-variant-card th{padding:10px 14px}.recipe-variant-card th{background:#fff}.recipe-variant-card th:first-child{width:45%}.recipe-variant-card th:last-child{width:100px;text-align:right}.recipe-variant-card td:last-child{text-align:right}@media(max-width:900px){.recipe-manager-head{display:block;padding:19px}.recipe-manager-head>span{display:block;max-width:none;margin-top:13px}.recipe-manager-body{padding:16px 18px 18px}.recipe-manager-form{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.recipe-manager-body{padding:14px}.recipe-sync{align-items:flex-start}.recipe-manager-form{grid-template-columns:1fr}.recipe-manager-form .btn{width:100%}.recipe-variant-card td,.recipe-variant-card th{padding:9px 8px}.recipe-variant-card th:first-child{width:auto}.recipe-variant-card .btn{padding:7px 8px;font-size:12px}}';
  document.head.appendChild(recipeStyle);
  let liveRecipes = null;
  const state = () => {
    const snapshot = window.nesboothCloudState || {products: [], materials: [], recipes: []};
    return {...snapshot, recipes: liveRecipes || snapshot.recipes || []};
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const request = async (url, options) => {
    const response = await fetch(url, {headers: {'Content-Type': 'application/json'}, ...options});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Resep tidak dapat disimpan');
    return data;
  };
  async function reloadRecipes() {
    syncInfo.textContent = 'Memuat resep terbaru dari server...';
    try {
      const data = await request('/api/bootstrap');
      liveRecipes = Array.isArray(data.recipes) ? data.recipes : [];
      syncInfo.textContent = `${liveRecipes.length} baris resep dimuat dari server.`;
      render();
    } catch (error) {
      syncInfo.textContent = `Resep belum dapat dimuat: ${error.message || 'periksa koneksi dan login.'}`;
    }
  }
  const variantsFor = (name, savedVariants = []) => {
    const presets = name === 'Nescafé Caffe Latte'
      ? ['Normal Dingin', 'Normal Panas', 'Strong Dingin', 'Strong Panas', 'Less Dingin', 'Less Panas', 'Nano Dingin', 'Nano Panas']
      : name === 'Nescafé Ice Roast'
        ? ['1 Shot Dingin', '2 Shot Dingin', '3 Shot Dingin', '1 Shot Panas', '2 Shot Panas', '3 Shot Panas']
        : [];
    const variants = [...new Set([...presets, ...savedVariants.filter(Boolean)])];
    return variants.length ? variants : [''];
  };
  function renderVariantOptions() {
    const product = state().products.find(item => item.id === productSelect.value);
    const oldVariant = variantInput.value;
    const savedVariants = (state().recipes || []).filter(recipe => recipe.product_id === product?.id).map(recipe => recipe.variant || '');
    const variants = variantsFor(product?.name, savedVariants);
    variantInput.innerHTML = variants.map(variant => `<option value="${escape(variant)}">${escape(variant || 'Standar')}</option>`).join('');
    if (variants.includes(oldVariant)) variantInput.value = oldVariant;
  }
  function render() {
    const data = state(); const oldProduct = productSelect.value, oldMaterial = materialSelect.value;
    productSelect.innerHTML = data.products.length ? data.products.map(product => `<option value="${product.id}">${escape(product.name)}</option>`).join('') : '<option>Belum ada menu</option>';
    materialSelect.innerHTML = data.materials.length ? data.materials.map(material => `<option value="${material.id}">${escape(material.name)} (${escape(material.unit)})</option>`).join('') : '<option>Belum ada bahan</option>';
    if ([...productSelect.options].some(option => option.value === oldProduct)) productSelect.value = oldProduct;
    if ([...materialSelect.options].some(option => option.value === oldMaterial)) materialSelect.value = oldMaterial;
    renderVariantOptions();
    const productId = productSelect.value;
    const product = data.products.find(item => item.id === productId);
    const productRecipes = (data.recipes || []).filter(recipe => recipe.product_id === productId);
    if (!productRecipes.length) {
      rows.innerHTML = '<p class="muted">Belum ada bahan pada resep menu ini. Menu tanpa resep tidak akan memotong stok.</p>';
      return;
    }
    const grouped = new Map();
    productRecipes.forEach(recipe => {
      const variant = recipe.variant || '';
      if (!grouped.has(variant)) grouped.set(variant, []);
      grouped.get(variant).push(recipe);
    });
    const configuredOrder = variantsFor(product?.name, variants);
    const variants = [...grouped.keys()].sort((left, right) => {
      const leftIndex = configuredOrder.indexOf(left), rightIndex = configuredOrder.indexOf(right);
      if (leftIndex >= 0 || rightIndex >= 0) return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
      return left.localeCompare(right, 'id');
    });
    rows.innerHTML = `<div class="recipe-variant-list">${variants.map(variant => {
      const recipes = grouped.get(variant);
      return `<section class="recipe-variant-card"><div class="recipe-variant-head"><b>${escape(variant || 'Resep Standar')}</b><span>${recipes.length} bahan per porsi</span></div><table><thead><tr><th>Bahan</th><th>Jumlah/porsi</th><th></th></tr></thead><tbody>${recipes.map(recipe => {
        const material = data.materials.find(item => item.id === recipe.material_id);
        return `<tr><td>${escape(material?.name || 'Bahan tidak ditemukan')}</td><td>${Number(recipe.amount)} ${escape(material?.unit || '')}</td><td><button class="btn ghost delete-recipe" type="button" data-product="${recipe.product_id}" data-material="${recipe.material_id}" data-variant="${escape(recipe.variant || '')}">Hapus</button></td></tr>`;
      }).join('')}</tbody></table></section>`;
    }).join('')}</div>`;
  }
  productSelect.onchange = () => { renderVariantOptions(); render(); };
  box.querySelector('#reloadRecipes').onclick = reloadRecipes;
  box.querySelector('#saveRecipe').onclick = async event => {
    const product_id = productSelect.value, material_id = materialSelect.value, amount = Number(amountInput.value), variant = variantInput.value.trim();
    if (!/^[0-9a-f-]{36}$/i.test(product_id) || !/^[0-9a-f-]{36}$/i.test(material_id) || !Number.isFinite(amount) || amount <= 0) { show('Lengkapi resep dengan jumlah yang valid.'); return; }
    const button = event.currentTarget; button.disabled = true; button.textContent = 'Menyimpan...';
    try {
      await request('/api/recipes', {method: 'POST', body: JSON.stringify({product_id, material_id, variant, amount})});
      await window.nesboothCloudReload?.(); render(); show('Resep tersimpan. Stok akan dipotong otomatis pada transaksi berikutnya.');
    } catch (error) { show(error.message || 'Resep tidak dapat disimpan.'); }
    finally { button.disabled = false; button.textContent = 'Simpan Resep'; }
  };
  rows.addEventListener('click', async event => {
    const button = event.target.closest('.delete-recipe'); if (!button || !confirm('Hapus bahan ini dari resep?')) return;
    try {
      await request(`/api/recipes?product_id=${encodeURIComponent(button.dataset.product)}&material_id=${encodeURIComponent(button.dataset.material)}&variant=${encodeURIComponent(button.dataset.variant || '')}`, {method: 'DELETE'});
      await window.nesboothCloudReload?.(); render(); show('Bahan dihapus dari resep.');
    } catch (error) { show(error.message || 'Resep tidak dapat dihapus.'); }
  });
  window.addEventListener('nesbooth-cloud-updated', render);
  document.addEventListener('pos-session-ready', () => setTimeout(reloadRecipes, 0));
  render();
  setTimeout(reloadRecipes, 600);
})();
