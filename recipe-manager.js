// Editor resep pusat. Resep ini dipakai server untuk memotong stok saat pembayaran berhasil.
(() => {
  if (!/\.onrender\.com$/i.test(location.hostname)) return;
  const page = document.getElementById('produk');
  if (!page) return;
  const box = document.createElement('div'); box.className = 'card table-card'; box.style.marginTop = '18px';
  box.innerHTML = `<h2>Resep Menu Online</h2><p class="muted">Tentukan bahan dan jumlah yang dipotong otomatis setiap satu menu terjual. Isi varian bila takaran berbeda, misalnya “2 Shot” atau “1 Shot Panas”.</p><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:16px 0"><label class="field" style="min-width:190px;flex:1">Menu<select id="recipeProduct"></select></label><label class="field" style="min-width:150px;flex:1">Varian (opsional)<input id="recipeVariant" maxlength="80" placeholder="Contoh: 2 Shot"></label><label class="field" style="min-width:190px;flex:1">Bahan<select id="recipeMaterial"></select></label><label class="field" style="min-width:130px">Jumlah per porsi<input id="recipeAmount" type="number" min="0.01" step="0.01" value="1"></label><button id="saveRecipe" class="btn" type="button">Simpan Resep</button></div><div id="recipeRows" class="muted">Memuat resep pusat...</div>`;
  page.appendChild(box);
  const productSelect = box.querySelector('#recipeProduct');
  const variantInput = box.querySelector('#recipeVariant');
  const materialSelect = box.querySelector('#recipeMaterial');
  const amountInput = box.querySelector('#recipeAmount');
  const rows = box.querySelector('#recipeRows');
  const state = () => window.nesboothCloudState || {products: [], materials: [], recipes: []};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const request = async (url, options) => {
    const response = await fetch(url, {headers: {'Content-Type': 'application/json'}, ...options});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Resep tidak dapat disimpan');
    return data;
  };
  function render() {
    const data = state(); const oldProduct = productSelect.value, oldMaterial = materialSelect.value;
    productSelect.innerHTML = data.products.length ? data.products.map(product => `<option value="${product.id}">${escape(product.name)}</option>`).join('') : '<option>Belum ada menu</option>';
    materialSelect.innerHTML = data.materials.length ? data.materials.map(material => `<option value="${material.id}">${escape(material.name)} (${escape(material.unit)})</option>`).join('') : '<option>Belum ada bahan</option>';
    if ([...productSelect.options].some(option => option.value === oldProduct)) productSelect.value = oldProduct;
    if ([...materialSelect.options].some(option => option.value === oldMaterial)) materialSelect.value = oldMaterial;
    const productId = productSelect.value;
    const productRecipes = (data.recipes || []).filter(recipe => recipe.product_id === productId);
    rows.innerHTML = productRecipes.length ? `<table><thead><tr><th>Varian</th><th>Bahan</th><th>Jumlah/porsi</th><th></th></tr></thead><tbody>${productRecipes.map(recipe => {
      const material = data.materials.find(item => item.id === recipe.material_id);
      return `<tr><td>${escape(recipe.variant || 'Standar')}</td><td>${escape(material?.name || 'Bahan tidak ditemukan')}</td><td>${Number(recipe.amount)} ${escape(material?.unit || '')}</td><td><button class="btn ghost delete-recipe" type="button" data-product="${recipe.product_id}" data-material="${recipe.material_id}" data-variant="${escape(recipe.variant || '')}">Hapus</button></td></tr>`;
    }).join('')}</tbody></table>` : '<p class="muted">Belum ada bahan pada resep menu ini. Menu tanpa resep tidak akan memotong stok.</p>';
  }
  productSelect.onchange = render;
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
  render();
})();
