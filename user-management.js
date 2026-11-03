// Pengelolaan akun Kasir dan Bar. Halaman ini hanya tampak untuk Admin.
(() => {
  if (!/\.onrender\.com$/i.test(location.hostname)) return;
  const root = document.getElementById('userManagementContent');
  if (!root) return;
  const session = () => { try { return JSON.parse(localStorage.getItem('nesbooth-pos-session') || '{}'); } catch { return {}; } };
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const when = value => new Date(value).toLocaleString('id-ID', {timeZone:'Asia/Jakarta', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
  const request = async (url, options = {}) => {
    const response = await fetch(url, {headers:{'Content-Type':'application/json'}, ...options});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Manajemen pengguna tidak dapat diproses');
    return body;
  };
  let data = {users: [], activities: []};
  let started = false;

  function render() {
    const users = data.users || [], activities = data.activities || [];
    root.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px;align-items:start;flex-wrap:wrap"><div><h2 style="margin:0">Manajemen Pengguna</h2><p class="muted" style="margin:6px 0 0">Admin dapat membuat akun Kasir/Bar, mengganti PIN, dan mengatur status akun.</p></div></div>
      <form id="createPosUser" style="margin:20px 0;padding:16px;border:1px solid #dce6f0;border-radius:11px;background:#f8fbff;display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;align-items:end"><label style="display:grid;gap:6px;font-weight:650">Nama pengguna<input id="newUserName" maxlength="120" required placeholder="Contoh: Rina"></label><label style="display:grid;gap:6px;font-weight:650">Peran<select id="newUserRole"><option value="kasir">Kasir</option><option value="bar">Bar</option></select></label><label style="display:grid;gap:6px;font-weight:650">PIN 4–6 digit<input id="newUserPin" type="password" inputmode="numeric" pattern="[0-9]{4,6}" minlength="4" maxlength="6" required placeholder="••••"></label><button class="btn" type="submit">+ Buat Akun</button></form>
      <h2>Akun POS</h2><div style="overflow:auto"><table style="min-width:680px"><tr><th>Nama</th><th>Peran</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr>${users.length ? users.map(user => `<tr><td><b>${esc(user.name)}</b></td><td style="text-transform:capitalize">${esc(user.role)}</td><td><span class="badge ${user.is_active ? 'ready' : 'cancelled'}">${user.is_active ? 'Aktif' : 'Nonaktif'}</span></td><td>${when(user.created_at)}</td><td style="white-space:nowrap"><button class="btn ghost user-pin" data-id="${user.id}" data-name="${esc(user.name)}">Ganti PIN</button> <button class="btn ghost user-status" data-id="${user.id}" data-name="${esc(user.name)}" data-active="${user.is_active}">${user.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button></td></tr>`).join('') : '<tr><td colspan="5" class="muted" style="text-align:center;padding:18px">Belum ada akun.</td></tr>'}</table></div>
      <hr style="border:0;border-top:1px solid #e4eaf1;margin:26px 0 16px"><h2>Aktivitas Pengguna</h2><div style="overflow:auto"><table style="min-width:680px"><tr><th>Waktu</th><th>Pengguna</th><th>Aktivitas</th><th>Detail</th></tr>${activities.length ? activities.map(log => `<tr><td>${when(log.created_at)}</td><td>${esc(log.actor_name)}</td><td><b>${esc(log.action)}</b></td><td>${esc(log.details)}</td></tr>`).join('') : '<tr><td colspan="4" class="muted" style="text-align:center;padding:18px">Belum ada aktivitas tercatat.</td></tr>'}</table></div>`;
    document.getElementById('createPosUser').addEventListener('submit', createUser);
    root.querySelectorAll('.user-pin').forEach(button => button.addEventListener('click', () => changePin(button)));
    root.querySelectorAll('.user-status').forEach(button => button.addEventListener('click', () => setStatus(button)));
  }
  async function manage(payload) {
    const current = session();
    return request('/api/users', {method:'POST', body:JSON.stringify({...payload, actor: current.name, actor_role: current.role})});
  }
  async function createUser(event) {
    event.preventDefault(); const button = event.target.querySelector('button[type="submit"]'); button.disabled = true;
    try { await manage({action:'create', name:document.getElementById('newUserName').value, role:document.getElementById('newUserRole').value, pin:document.getElementById('newUserPin').value}); show('Akun baru berhasil dibuat.'); await load(); }
    catch (error) { show(error.message || 'Akun tidak dapat dibuat.'); } finally { button.disabled = false; }
  }
  async function changePin(button) {
    const pin = prompt(`PIN baru untuk ${button.dataset.name} (4–6 digit):`); if (pin === null) return;
    if (!/^\d{4,6}$/.test(pin)) return show('PIN harus terdiri dari 4–6 digit angka.');
    try { await manage({action:'change_pin', user_id:button.dataset.id, pin}); show('PIN berhasil diganti.'); await load(); } catch (error) { show(error.message || 'PIN tidak dapat diganti.'); }
  }
  async function setStatus(button) {
    const active = button.dataset.active !== 'true'; const label = active ? 'mengaktifkan' : 'menonaktifkan';
    if (!confirm(`Yakin ${label} akun ${button.dataset.name}?`)) return;
    try { await manage({action:'set_active', user_id:button.dataset.id, is_active:active}); show(`Akun berhasil ${active ? 'diaktifkan' : 'dinonaktifkan'}.`); await load(); } catch (error) { show(error.message || 'Status akun tidak dapat diubah.'); }
  }
  async function load() {
    try { data = await request('/api/users'); render(); } catch (error) { root.innerHTML = `<h2>Manajemen Pengguna</h2><p class="muted">${esc(error.message || 'Data pengguna tidak dapat dimuat.')}</p>`; }
  }
  function start(activeSession = session()) {
    if (started || activeSession.role !== 'admin') return;
    started = true; load(); setInterval(load, 60000);
  }
  document.addEventListener('pos-session-ready', event => start(event.detail));
  start();
})();
