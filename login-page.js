// Layar login PIN untuk Admin, Kasir, dan Bar. Data akun diverifikasi server.
(() => {
  if (!/\.onrender\.com$/i.test(location.hostname)) return;
  const storageKey = 'nesbooth-pos-session';
  const permissions = {
    admin: ['dashboard', 'kasir', 'antrian', 'produk', 'transaksi', 'laporan', 'pengaturan'],
    kasir: ['dashboard', 'kasir', 'antrian', 'transaksi'],
    bar: ['antrian']
  };
  const style = document.createElement('style');
  style.textContent = `body.pos-locked{overflow:hidden}.pos-login{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;background:linear-gradient(135deg,#0d2842,#163f65)}.pos-login-card{width:min(430px,100%);padding:34px;border-radius:18px;background:#fff;box-shadow:0 24px 70px #0006;color:#18324b}.pos-login-brand{font-size:26px;font-weight:900;color:#102a43;margin-bottom:8px}.pos-login-brand b{display:inline-grid;place-items:center;width:32px;height:32px;margin-right:8px;border-radius:9px;background:#e73640;color:#fff;font-size:18px}.pos-login-card p{color:#718096;margin:0 0 22px}.role-picks{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:18px 0}.role-pick{border:1px solid #dbe5ef;background:#fff;border-radius:10px;padding:12px 6px;color:#345;cursor:pointer;font-weight:750}.role-pick.active{background:#eaf4ff;border:2px solid #1677ff;color:#1677ff}.pin-input{width:100%;padding:14px;border:1px solid #cbd5e1;border-radius:10px;text-align:center;font-size:24px;letter-spacing:.4em;outline:none}.pin-input:focus{border-color:#1677ff;box-shadow:0 0 0 3px #1677ff20}.login-submit{width:100%;margin-top:14px;border:0;border-radius:10px;padding:14px;background:#1677ff;color:#fff;font-weight:800;font-size:15px;cursor:pointer}.login-error{min-height:20px;margin-top:10px;color:#d8323f;text-align:center;font-size:13px}.session-user{position:fixed;right:18px;bottom:18px;z-index:20;background:#ffffffeb;border:1px solid #dbe5ef;border-radius:9px;padding:8px 10px;font-size:12px;color:#345;box-shadow:0 3px 12px #102a4320}.session-user button{margin-left:8px;border:0;background:none;color:#1677ff;cursor:pointer;font-weight:700}`;
  document.head.appendChild(style);
  const overlay = document.createElement('div'); overlay.className = 'pos-login';
  overlay.innerHTML = `<form class="pos-login-card"><div class="pos-login-brand"><b>N</b>NesBooth</div><p>Masuk untuk menggunakan sistem POS.</p><div class="role-picks"><button class="role-pick active" type="button" data-role="admin">Admin</button><button class="role-pick" type="button" data-role="kasir">Kasir</button><button class="role-pick" type="button" data-role="bar">Bar</button></div><label style="font-weight:700;font-size:13px">PIN</label><input class="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="current-password" type="password" placeholder="••••••" required><button class="login-submit" type="submit">Masuk ke POS</button><div class="login-error"></div></form>`;
  document.body.appendChild(overlay); document.body.classList.add('pos-locked');
  let selectedRole = 'admin';
  const form = overlay.querySelector('form'), pinInput = overlay.querySelector('.pin-input'), error = overlay.querySelector('.login-error');
  function applyAccess(session) {
    const allowed = permissions[session.role] || [];
    document.querySelectorAll('.nav button[data-page]').forEach(button => { button.style.display = allowed.includes(button.dataset.page) ? '' : 'none'; });
    const active = document.querySelector('.page.active');
    if (active && !allowed.includes(active.id)) document.querySelector(`.nav button[data-page="${allowed[0]}"]`)?.click();
    overlay.remove(); document.body.classList.remove('pos-locked');
    const badge = document.createElement('div'); badge.className = 'session-user';
    badge.innerHTML = `<b>${session.name}</b> · ${session.role}<button type="button">Keluar</button>`;
    badge.querySelector('button').onclick = () => { localStorage.removeItem(storageKey); location.reload(); };
    document.body.appendChild(badge);
  }
  overlay.querySelectorAll('.role-pick').forEach(button => button.onclick = () => {
    selectedRole = button.dataset.role; overlay.querySelector('.role-pick.active').classList.remove('active'); button.classList.add('active'); pinInput.focus();
  });
  form.onsubmit = async event => {
    event.preventDefault(); error.textContent = '';
    const button = form.querySelector('.login-submit'); button.disabled = true; button.textContent = 'Memeriksa...';
    try {
      const response = await fetch('/api/auth/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:selectedRole,pin:pinInput.value})});
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Login gagal');
      localStorage.setItem(storageKey, JSON.stringify(data)); applyAccess(data);
    } catch (err) { error.textContent = err.message || 'Login gagal'; pinInput.select(); }
    finally { button.disabled = false; button.textContent = 'Masuk ke POS'; }
  };
  try { const saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (saved?.expiresAt > Date.now() && permissions[saved.role]) applyAccess(saved); else pinInput.focus(); } catch { pinInput.focus(); }
})();
