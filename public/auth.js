// ================================================================
//  TRACER LIVE — Auth Module (auth.js)
//  Injects: Login Modal + Profile Panel into any page
// ================================================================
(function (window) {
  'use strict';

  const USER_KEY     = 'tracer_user';
  const BOOKINGS_KEY = 'tracer_bookings';
  const SAVED_KEY    = 'tracer_saved';

  let _user = null;
  const _listeners = [];

  // ---- Helpers ----
  function _initials(name) {
    return (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').substring(0, 2).toUpperCase();
  }
  function _save() { try { localStorage.setItem(USER_KEY, JSON.stringify(_user)); } catch(e) {} }
  function _notify() { _listeners.forEach(fn => fn(_user)); _updateDOM(); }

  function _setUser(u) { _user = u; _save(); _notify(); }

  // ---- Core API ----
  const TracerAuth = {

    init() {
      try { const r = localStorage.getItem(USER_KEY); if (r) _user = JSON.parse(r); } catch(e) {}
      _injectModal();
      _injectProfilePanel();
      _updateDOM();
      return _user;
    },

    isLoggedIn() { return !!_user; },
    getUser()    { return _user; },

    login(email, password) {
      return new Promise(async (res, rej) => {
        if (!email || !email.includes('@')) return rej(new Error('Enter a valid email'));
        if (!password || password.length < 6) return rej(new Error('Password must be 6+ characters'));
        try {
          if (window.TracerAPI) {
            const out = await TracerAPI.login(email, password);
            if (out?.token && out?.user) {
              const u = out.user;
              _setUser({ uid:u.id, name:u.name, email:u.email, phone:u.phone || '', initials:_initials(u.name), role:u.role || 'passenger', joinDate:new Date().toISOString(), provider:'email' });
              return res(_user);
            }
            if (out?.error) throw new Error(out.error);
          }
          const name = email.split('@')[0].replace(/[._-]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
          _setUser({ uid:'demo_'+Date.now(), name, email: email.toLowerCase(), phone:'', initials: _initials(name), role:'passenger', joinDate: new Date().toISOString(), provider:'email' });
          res(_user);
        } catch (err) { rej(err); }
      });
    },

    register(name, email, password, phone) {
      return new Promise(async (res, rej) => {
        if (!name || name.length < 2) return rej(new Error('Enter your full name'));
        if (!email || !email.includes('@')) return rej(new Error('Enter a valid email'));
        if (!password || password.length < 6) return rej(new Error('Password must be 6+ characters'));
        try {
          if (window.TracerAPI) {
            const out = await TracerAPI.register(name.trim(), email, password, phone || '', 'passenger');
            if (out?.token && out?.user) {
              const u = out.user;
              _setUser({ uid:u.id, name:u.name, email:u.email, phone:u.phone || '', initials:_initials(u.name), role:u.role || 'passenger', joinDate:new Date().toISOString(), provider:'email' });
              return res(_user);
            }
            if (out?.error) throw new Error(out.error);
          }
          _setUser({ uid:'demo_'+Date.now(), name: name.trim(), email: email.toLowerCase(), phone: phone||'', initials: _initials(name), role:'passenger', joinDate: new Date().toISOString(), provider:'email' });
          res(_user);
        } catch (err) { rej(err); }
      });
    },

    loginWithGoogle() {
      return new Promise(res => {
        const names = ['Arjun Sharma','Priya Patel','Rohit Verma','Kavita Singh','Amit Kumar'];
        const n = names[Math.floor(Math.random() * names.length)];
        setTimeout(() => {
          _setUser({ uid:'google_'+Date.now(), name:n, email: n.toLowerCase().replace(' ','.'+'@gmail.com'), phone:'+91 98765 43210', initials: _initials(n), role:'passenger', joinDate: new Date().toISOString(), provider:'google' });
          res(_user);
        }, 1000);
      });
    },

    logout() {
      _user = null;
      if (window.TracerAPI) TracerAPI.logout();
      localStorage.removeItem(USER_KEY);
      _notify();
    },

    onChange(fn) { _listeners.push(fn); fn(_user); },

    // Bookings
    getBookings() { try { return JSON.parse(localStorage.getItem(BOOKINGS_KEY)||'[]'); } catch(e) { return []; } },
    addBooking(b) { const l = this.getBookings(); l.unshift(b); localStorage.setItem(BOOKINGS_KEY, JSON.stringify(l)); },

    // Saved routes
    getSaved() { try { return JSON.parse(localStorage.getItem(SAVED_KEY)||'[]'); } catch(e) { return []; } },
    saveRoute(r) {
      const l = this.getSaved();
      if (!l.find(x => x.from===r.from && x.to===r.to)) { l.unshift({...r, at: new Date().toISOString()}); localStorage.setItem(SAVED_KEY, JSON.stringify(l.slice(0,10))); }
    },

    // Modal / Profile panel controls
    openLogin()   { _injectModal(); document.getElementById('t-auth-overlay').classList.add('open'); _setAuthMode('login'); },
    openRegister(){ _injectModal(); document.getElementById('t-auth-overlay').classList.add('open'); _setAuthMode('register'); },
    closeAuth()   { const o = document.getElementById('t-auth-overlay'); if(o) o.classList.remove('open'); },
    openProfile() { _injectProfilePanel(); _renderProfile(); document.getElementById('t-profile-panel').classList.add('open'); document.body.style.overflow='hidden'; },
    closeProfile(){ const p = document.getElementById('t-profile-panel'); if(p) p.classList.remove('open'); document.body.style.overflow=''; },

    updateDOM: _updateDOM
  };

  // ==============================================================
  //  DOM UPDATER
  // ==============================================================
  function _updateDOM() {
    const u = _user;
    document.querySelectorAll('[data-auth-avatar]').forEach(el => {
      el.textContent = u ? u.initials : '?';
      el.style.background = u ? 'linear-gradient(135deg,#1B6B45,#1565C0)' : '';
      el.classList.toggle('logged-in', !!u);
    });
    document.querySelectorAll('[data-auth-name]').forEach(el  => el.textContent = u ? u.name  : 'Guest User');
    document.querySelectorAll('[data-auth-email]').forEach(el => el.textContent = u ? u.email : 'Not signed in');
    document.querySelectorAll('[data-show-loggedin]').forEach(el  => el.style.display = u ? '' : 'none');
    document.querySelectorAll('[data-show-loggedout]').forEach(el => el.style.display = u ? 'none' : '');
  }

  // ==============================================================
  //  AUTH MODAL
  // ==============================================================
  function _injectModal() {
    if (document.getElementById('t-auth-overlay')) return;
    const el = document.createElement('div');
    el.id = 't-auth-overlay';
    el.className = 't-auth-overlay';
    el.innerHTML = `
      <div class="t-auth-card">
        <div class="t-auth-banner">
          <span style="font-size:40px;">🚌</span>
          <div class="t-auth-brand">Tracer Live</div>
          <div class="t-auth-tag">Your real-time bus companion</div>
          <button class="t-auth-x" id="t-auth-close"><span class="material-icons-round" style="font-size:18px;">close</span></button>
        </div>
        <div class="t-auth-tabs">
          <button class="t-auth-tab active" data-tab="login">Sign In</button>
          <button class="t-auth-tab"        data-tab="register">Register</button>
        </div>
        <!-- LOGIN -->
        <div class="t-auth-form" id="t-form-login">
          <div class="form-group">
            <label class="form-label">EMAIL</label>
            <input class="form-input" id="t-login-email" type="email" placeholder="you@example.com" autocomplete="email" />
          </div>
          <div class="form-group" style="position:relative;">
            <label class="form-label">PASSWORD</label>
            <input class="form-input" id="t-login-pass" type="password" placeholder="Min 6 characters" autocomplete="current-password" />
          </div>
          <div class="t-auth-err" id="t-login-err" style="display:none;"></div>
          <button class="btn btn-primary btn-full" id="t-login-btn">
            <span class="material-icons-round">login</span> SIGN IN
          </button>
          <div class="t-auth-or"><span>OR</span></div>
          <button class="t-google-btn" id="t-login-google">
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#EA4335" d="M5.27 9.76A7.08 7.08 0 0119.07 12c0 .68-.09 1.35-.26 1.98H12v-3.36h7.55A7.08 7.08 0 0012 4.92c-2.27 0-4.28 1.07-5.6 2.74z"/><path fill="#34A853" d="M12 19.08c2.27 0 4.16-.74 5.55-2.01l-2.7-2.1a4.38 4.38 0 01-2.85.96 4.36 4.36 0 01-4.09-2.89L5.22 15.2A7.08 7.08 0 0012 19.08z"/><path fill="#FBBC05" d="M7.91 13.04A4.4 4.4 0 017.63 12c0-.36.06-.71.15-1.04L5.03 8.8A7.07 7.07 0 004.92 12c0 1.13.27 2.21.75 3.17z"/><path fill="#4285F4" d="M12 7.64c1.24 0 2.35.43 3.23 1.26l2.42-2.42A7.06 7.06 0 0012 4.92c-2.77 0-5.17 1.6-6.37 3.92l2.73 2.12A4.37 4.37 0 0112 7.64z"/></svg>
            Continue with Google
          </button>
        </div>
        <!-- REGISTER -->
        <div class="t-auth-form" id="t-form-register" style="display:none;">
          <div class="form-group">
            <label class="form-label">FULL NAME</label>
            <input class="form-input" id="t-reg-name" type="text" placeholder="Your full name" autocomplete="name" />
          </div>
          <div class="form-group">
            <label class="form-label">EMAIL</label>
            <input class="form-input" id="t-reg-email" type="email" placeholder="you@example.com" autocomplete="email" />
          </div>
          <div class="form-group">
            <label class="form-label">PHONE</label>
            <input class="form-input" id="t-reg-phone" type="tel" placeholder="+91 98765 43210" autocomplete="tel" />
          </div>
          <div class="form-group">
            <label class="form-label">PASSWORD</label>
            <input class="form-input" id="t-reg-pass" type="password" placeholder="Minimum 6 characters" autocomplete="new-password" />
          </div>
          <div class="t-auth-err" id="t-reg-err" style="display:none;"></div>
          <button class="btn btn-primary btn-full" id="t-reg-btn">
            <span class="material-icons-round">person_add</span> CREATE ACCOUNT
          </button>
          <div class="t-auth-or"><span>OR</span></div>
          <button class="t-google-btn" id="t-reg-google">
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#EA4335" d="M5.27 9.76A7.08 7.08 0 0119.07 12c0 .68-.09 1.35-.26 1.98H12v-3.36h7.55A7.08 7.08 0 0012 4.92c-2.27 0-4.28 1.07-5.6 2.74z"/><path fill="#34A853" d="M12 19.08c2.27 0 4.16-.74 5.55-2.01l-2.7-2.1a4.38 4.38 0 01-2.85.96 4.36 4.36 0 01-4.09-2.89L5.22 15.2A7.08 7.08 0 0012 19.08z"/><path fill="#FBBC05" d="M7.91 13.04A4.4 4.4 0 017.63 12c0-.36.06-.71.15-1.04L5.03 8.8A7.07 7.07 0 004.92 12c0 1.13.27 2.21.75 3.17z"/><path fill="#4285F4" d="M12 7.64c1.24 0 2.35.43 3.23 1.26l2.42-2.42A7.06 7.06 0 0012 4.92c-2.77 0-5.17 1.6-6.37 3.92l2.73 2.12A4.37 4.37 0 0112 7.64z"/></svg>
            Sign up with Google
          </button>
        </div>
        <div style="height:8px;"></div>
      </div>`;
    document.body.appendChild(el);
    _bindModalEvents();
  }

  function _setAuthMode(mode) {
    document.querySelectorAll('.t-auth-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === mode));
    document.getElementById('t-form-login').style.display    = mode === 'login'    ? '' : 'none';
    document.getElementById('t-form-register').style.display = mode === 'register' ? '' : 'none';
  }

  function _bindModalEvents() {
    document.getElementById('t-auth-close').onclick = () => TracerAuth.closeAuth();
    document.getElementById('t-auth-overlay').addEventListener('click', e => { if (e.target.id === 't-auth-overlay') TracerAuth.closeAuth(); });

    document.querySelectorAll('.t-auth-tab').forEach(btn => {
      btn.addEventListener('click', () => _setAuthMode(btn.dataset.tab));
    });

    // Login submit
    document.getElementById('t-login-btn').addEventListener('click', async () => {
      const btn = document.getElementById('t-login-btn');
      const err = document.getElementById('t-login-err');
      err.style.display = 'none';
      btn.disabled = true; btn.textContent = 'Signing in…';
      try {
        await TracerAuth.login(document.getElementById('t-login-email').value.trim(), document.getElementById('t-login-pass').value);
        TracerAuth.closeAuth();
        if (window.showSnackbar) showSnackbar('✅ Welcome back, ' + _user.name + '!');
      } catch(e) { err.textContent = e.message; err.style.display = 'block'; }
      btn.disabled = false; btn.innerHTML = '<span class="material-icons-round">login</span> SIGN IN';
    });

    // Google login
    ['t-login-google','t-reg-google'].forEach(id => {
      document.getElementById(id).addEventListener('click', async () => {
        try {
          await TracerAuth.loginWithGoogle();
          TracerAuth.closeAuth();
          if (window.showSnackbar) showSnackbar('✅ Signed in as ' + _user.name);
        } catch(e) { if (window.showSnackbar) showSnackbar('Google sign-in failed'); }
      });
    });

    // Register submit
    document.getElementById('t-reg-btn').addEventListener('click', async () => {
      const btn = document.getElementById('t-reg-btn');
      const err = document.getElementById('t-reg-err');
      err.style.display = 'none';
      btn.disabled = true; btn.textContent = 'Creating account…';
      try {
        await TracerAuth.register(
          document.getElementById('t-reg-name').value.trim(),
          document.getElementById('t-reg-email').value.trim(),
          document.getElementById('t-reg-pass').value,
          document.getElementById('t-reg-phone').value.trim()
        );
        TracerAuth.closeAuth();
        if (window.showSnackbar) showSnackbar('🎉 Account created! Welcome, ' + _user.name + '!');
      } catch(e) { err.textContent = e.message; err.style.display = 'block'; }
      btn.disabled = false; btn.innerHTML = '<span class="material-icons-round">person_add</span> CREATE ACCOUNT';
    });
  }

  // ==============================================================
  //  PROFILE PANEL
  // ==============================================================
  function _injectProfilePanel() {
    if (document.getElementById('t-profile-panel')) return;
    const el = document.createElement('div');
    el.id = 't-profile-panel';
    el.className = 't-profile-overlay';
    el.innerHTML = `
      <div class="t-profile-panel" id="t-profile-drawer">
        <div class="t-profile-topbar">
          <button class="icon-btn" id="t-profile-close"><span class="material-icons-round">arrow_back</span></button>
          <span style="font-size:15px;font-weight:700;flex:1;">My Profile</span>
          <a href="tickets.html" class="btn btn-primary" style="height:34px;font-size:11px;padding:0 14px;text-decoration:none;">
            <span class="material-icons-round" style="font-size:15px;">confirmation_number</span> Tickets
          </a>
        </div>

        <!-- Profile header -->
        <div class="t-profile-header" id="t-profile-header-logged" data-show-loggedin>
          <div class="t-profile-avatar-lg" data-auth-avatar>?</div>
          <div class="t-profile-info">
            <div class="t-profile-name" data-auth-name>Guest</div>
            <div class="t-profile-email" data-auth-email>—</div>
            <div class="t-profile-badges">
              <span class="bus-type-badge local">🎫 Passenger</span>
            </div>
          </div>
          <button class="icon-btn" id="t-edit-profile-btn" title="Edit profile"><span class="material-icons-round">edit</span></button>
        </div>
        <div class="t-signed-out-prompt" data-show-loggedout>
          <div style="font-size:42px;margin-bottom:10px;">👤</div>
          <div style="font-size:16px;font-weight:700;margin-bottom:6px;">Not signed in</div>
          <div style="font-size:13px;color:var(--text-sec);margin-bottom:16px;">Sign in to view bookings, saved routes and more</div>
          <button class="btn btn-primary" id="t-profile-signin-btn" style="width:200px;">
            <span class="material-icons-round">login</span> SIGN IN
          </button>
        </div>

        <!-- Stats -->
        <div class="t-profile-stats" data-show-loggedin>
          <div class="t-stat-box">
            <div class="t-stat-num" id="t-stat-bookings">0</div>
            <div class="t-stat-lbl">Bookings</div>
          </div>
          <div class="t-stat-box">
            <div class="t-stat-num" id="t-stat-saved">0</div>
            <div class="t-stat-lbl">Saved Routes</div>
          </div>
          <div class="t-stat-box">
            <div class="t-stat-num" id="t-stat-trips">0</div>
            <div class="t-stat-lbl">km Traveled</div>
          </div>
        </div>

        <div class="t-profile-scroll" id="t-profile-scroll">
          <!-- My Bookings -->
          <div data-show-loggedin>
            <div class="t-section-hdr">
              <span>MY BOOKINGS</span>
              <a href="tickets.html" style="font-size:11px;color:var(--accent);font-weight:600;text-decoration:none;">+ New Booking</a>
            </div>
            <div id="t-bookings-list"></div>
          </div>

          <!-- Saved Routes -->
          <div data-show-loggedin>
            <div class="t-section-hdr"><span>SAVED ROUTES</span></div>
            <div id="t-saved-list"></div>
          </div>

          <!-- Settings -->
          <div class="t-section-hdr"><span>PREFERENCES</span></div>
          <div class="t-settings-row" id="t-theme-row">
            <div class="si-icon yellow"><span class="material-icons-round">light_mode</span></div>
            <div style="flex:1;"><div style="font-size:14px;font-weight:600;">Theme</div><div style="font-size:12px;color:var(--text-sec);" id="t-theme-lbl">Light mode</div></div>
            <button class="toggle-sw" id="t-theme-sw"></button>
          </div>
          <div class="t-settings-row">
            <div class="si-icon orange"><span class="material-icons-round">notifications_active</span></div>
            <div style="flex:1;"><div style="font-size:14px;font-weight:600;">Arrival Alerts</div><div style="font-size:12px;color:var(--text-sec);">Notify when bus is near</div></div>
            <button class="toggle-sw on" id="t-notif-sw"></button>
          </div>

          <div class="t-section-hdr" data-show-loggedin><span>ACCOUNT</span></div>
          <button class="t-settings-row t-logout-row" id="t-logout-btn" data-show-loggedin>
            <div class="si-icon red"><span class="material-icons-round">logout</span></div>
            <div style="flex:1;text-align:left;"><div style="font-size:14px;font-weight:600;color:var(--error);">Sign Out</div></div>
            <span class="material-icons-round" style="color:var(--text-hint);font-size:18px;">chevron_right</span>
          </button>
          <div style="height:32px;"></div>
        </div>
      </div>`;
    document.body.appendChild(el);
    _bindProfileEvents();
  }

  function _renderProfile() {
    _updateDOM();
    const bookings = TracerAuth.getBookings();
    const saved    = TracerAuth.getSaved();

    // Stats
    const el = n => document.getElementById(n);
    if (el('t-stat-bookings')) el('t-stat-bookings').textContent = bookings.length;
    if (el('t-stat-saved'))    el('t-stat-saved').textContent    = saved.length;
    if (el('t-stat-trips'))    el('t-stat-trips').textContent    = bookings.reduce((s,b) => s + (b.distKm||0), 0);

    // Bookings list
    const bEl = el('t-bookings-list');
    if (bEl) {
      bEl.innerHTML = bookings.length ? bookings.map(b => `
        <div class="t-booking-card">
          <div class="t-bk-left">
            <div class="t-bk-pnr">PNR: ${b.pnr}</div>
            <div class="t-bk-route">${b.from} → ${b.to}</div>
            <div class="t-bk-meta">${b.date} · ${b.seats?.join(', ')||'—'}</div>
          </div>
          <div class="t-bk-right">
            <div class="t-bk-status ${b.status==='CONFIRMED'?'confirmed':'cancelled'}">${b.status}</div>
            <div class="t-bk-fare">₹${b.fare}</div>
          </div>
        </div>`).join('')
        : '<div class="empty-state" style="padding:20px 0;"><div class="empty-icon">🎫</div><div class="empty-title">No bookings yet</div><div class="empty-sub">Book your first ticket on the Tickets page</div></div>';
    }

    // Saved routes
    const sEl = el('t-saved-list');
    if (sEl) {
      sEl.innerHTML = saved.length ? saved.map(r => `
        <div class="t-saved-row">
          <span class="material-icons-round" style="color:var(--accent);font-size:18px;">bookmark</span>
          <div style="flex:1;"><div style="font-size:13px;font-weight:600;">${r.from} → ${r.to}</div><div style="font-size:11px;color:var(--text-hint);">${r.type||'Any'} bus</div></div>
          <a href="tickets.html?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}" style="font-size:11px;color:var(--accent);font-weight:600;text-decoration:none;">Book →</a>
        </div>`).join('')
        : '<div style="padding:12px 16px;font-size:13px;color:var(--text-hint);">No saved routes yet</div>';
    }

    // Theme toggle
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const sw = el('t-theme-sw');
    const lbl = el('t-theme-lbl');
    if (sw)  sw.classList.toggle('on', isDark);
    if (lbl) lbl.textContent = isDark ? 'Dark mode' : 'Light mode';
  }

  function _bindProfileEvents() {
    const el = id => document.getElementById(id);
    el('t-profile-close').onclick = () => TracerAuth.closeProfile();
    el('t-profile-overlay') || (document.getElementById('t-profile-panel').addEventListener('click', e => { if (e.target.id === 't-profile-panel') TracerAuth.closeProfile(); }));
    el('t-profile-signin-btn')?.addEventListener('click', () => { TracerAuth.closeProfile(); TracerAuth.openLogin(); });
    el('t-logout-btn')?.addEventListener('click', () => {
      TracerAuth.logout();
      TracerAuth.closeProfile();
      if (window.showSnackbar) showSnackbar('Signed out successfully');
    });
    el('t-theme-sw')?.addEventListener('click', function() {
      if (window.toggleTheme) toggleTheme();
      _renderProfile();
    });
    el('t-notif-sw')?.addEventListener('click', function() { this.classList.toggle('on'); });
  }

  window.TracerAuth = TracerAuth;
})(window);
