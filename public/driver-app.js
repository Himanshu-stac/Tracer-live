// ================================================================
//  TRACER LIVE - Driver App Logic
// ================================================================

(function () {
  initTheme();
  document.getElementById('theme-btn').addEventListener('click', toggleTheme);

  let driverUser = null;
  let busId = '';
  let busType = 'local';
  let routeLocked = false;
  let isTracking = false;
  let watchId = null;
  let updateCount = 0;
  let driverMap = null;
  let driverMarker = null;
  let updateInterval = null;
  let timerInterval = null;
  let tripStartedAt = null;
  let lastPos = null;
  let selectedEmergency = null;
  let socket = null;

  const $ = id => document.getElementById(id);

  function selectedBus() {
    return BUS_DATABASE.find(b => b.id === busId) || DEMO_BUSES[busId]?.info || null;
  }

  function fillBusSelect() {
    const select = $('bus-select');
    const buses = BUS_DATABASE.filter(b => b.type === busType);
    select.innerHTML = '<option value="">-- Select your bus --</option>' + buses.map(b =>
      `<option value="${b.id}" data-route="${b.route}" data-type="${b.type}">${b.id} - ${b.plate}</option>`
    ).join('');
  }

  function updateSeatStats() {
    const bus = selectedBus();
    const capacity = bus?.capacity || 50;
    const seats = BUS_SEATS[busId];
    const booked = seats?.booked?.length ?? Math.round(capacity * 0.35);
    const available = Math.max(0, capacity - booked);
    $('stat-seats').textContent = available;
    $('stat-seats-total').textContent = `/ ${capacity} seats`;
    $('seat-fill-bar').style.width = `${Math.round((available / capacity) * 100)}%`;
  }

  document.querySelectorAll('.bus-type-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bus-type-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      busType = btn.dataset.type;
      fillBusSelect();
    });
  });

  $('bus-select').addEventListener('change', e => {
    const opt = e.target.selectedOptions[0];
    busId = e.target.value;
    $('driver-busid-manual').value = busId;
    $('driver-route').value = opt?.dataset.route || '';
    if (opt?.dataset.type) busType = opt.dataset.type;
  });

  $('driver-busid-manual').addEventListener('input', e => {
    busId = e.target.value.trim().toUpperCase();
  });

  $('login-btn').addEventListener('click', handleLogin);
  $('driver-password').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });

  async function ensureDriverAccount(email, password) {
    let result = await TracerAPI.login(email, password);
    if (result?._noBackend) return result; // let handleLogin do demo fallback
    if (result?.token) return result;
    if (String(result?.error || '').toLowerCase().includes('invalid')) {
      result = await TracerAPI.register(email.split('@')[0] || 'Driver', email, password, '', 'driver');
    }
    return result;
  }

  async function handleLogin() {
    const email = $('driver-email').value.trim();
    const password = $('driver-password').value.trim();
    const manualBus = $('driver-busid-manual').value.trim().toUpperCase();
    const selected = $('bus-select').value;
    const route = $('driver-route').value.trim();
    busId = manualBus || selected;

    if (!email || !email.includes('@')) { showSnackbar('Please enter a valid email'); return; }
    if (password.length < 6) { showSnackbar('Password must be 6+ characters'); return; }
    if (!busId) { showSnackbar('Select a bus or enter a Bus ID'); return; }

    const btn = $('login-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;"></span> Signing in...';

    try {
      const result = await ensureDriverAccount(email, password);

      // Backend unavailable — create local demo driver session
      if (result?._noBackend) {
        const name = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        driverUser = {
          id: 'demo-driver-' + Date.now(), name, email,
          role: 'driver', phone: '', busId,
          route: route || selectedBus()?.route || 'Custom Route',
          type: selectedBus()?.type || busType
        };
        onLoginSuccess();
        return;
      }

      if (result?.error) throw new Error(result.error);
      if (result.user?.role !== 'driver') {
        throw new Error('This account is not registered as a driver');
      }
      driverUser = {
        ...result.user,
        name: result.user.name || email.split('@')[0],
        busId,
        route: route || selectedBus()?.route || 'Custom Route',
        type: selectedBus()?.type || busType
      };
      onLoginSuccess();
    } catch (err) {
      showSnackbar('Login failed: ' + err.message);
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons-round">login</span> SIGN IN & START';
    }
  }

  function onLoginSuccess() {
    $('auth-panel').style.display = 'none';
    $('dashboard').style.display = window.innerWidth >= 900 ? 'grid' : 'block';
    $('logout-btn').style.display = 'flex';

    const initials = (driverUser.name || 'D').substring(0, 2).toUpperCase();
    $('d-avatar').textContent = initials;
    $('d-name').textContent = driverUser.name || driverUser.email;
    $('d-busid-lbl').textContent = `Bus: ${driverUser.busId} - ${driverUser.type === 'local' ? 'Local' : 'Intercity'}`;
    $('d-status-badge').innerHTML = '<div class="live-badge"><span class="live-dot"></span>ONLINE</div>';

    updateSeatStats();
    initDriverMap();
    socket = getSocket();
    socket.emit('driver:join', busId);
    socket.on('bus:onboard_count', data => {
      if (data.bus_id === busId) {
        $('stat-onboard').textContent = data.count || 0;
        $('stat-sharing').textContent = data.count || 0;
      }
    });
    showSnackbar(`Welcome. Bus ${driverUser.busId} is ready.`);
  }

  function initDriverMap() {
    if (driverMap) {
      setTimeout(() => driverMap.invalidateSize(), 120);
      return;
    }
    driverMap = L.map('driver-map', { zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(driverMap);
    driverMap.setView([28.6139, 77.2090], 13);
    L.control.zoom({ position: 'bottomright' }).addTo(driverMap);
  }

  $('track-control-btn').addEventListener('click', () => {
    if (!isTracking) startTracking(); else stopTracking();
  });

  async function startTracking() {
    if (!('geolocation' in navigator)) {
      showSnackbar('Geolocation is not supported on this device');
      return;
    }

    const started = await TracerAPI.startTrip(busId, driverUser.route);
    if (started?.error && !started?._noBackend) {
      showSnackbar(started.error);
      return;
    }

    isTracking = true;
    tripStartedAt = Date.now();
    $('track-control-btn').className = 'track-control-btn stop';
    $('track-control-btn').innerHTML = '<span class="material-icons-round">stop</span> STOP TRACKING';
    $('track-hint').textContent = 'Broadcasting live to passengers...';
    setTrackingBar('active', 'Broadcasting Live', `Bus ${busId} - passengers can see you`);
    startTripTimer();

    socket = getSocket();
    socket.emit('driver:join', busId);
    watchId = navigator.geolocation.watchPosition(onPosition, onGpsError, {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 10000
    });
    updateInterval = setInterval(() => {
      if (lastPos) pushLocation(lastPos);
    }, 5000);
  }

  async function stopTracking() {
    isTracking = false;
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    await TracerAPI.stopTrip(busId);

    $('track-control-btn').className = 'track-control-btn start';
    $('track-control-btn').innerHTML = '<span class="material-icons-round">play_arrow</span> START TRACKING';
    $('track-hint').textContent = 'Press to broadcast your live location to passengers';
    setTrackingBar('inactive', 'Tracking Stopped', 'Passengers cannot see your latest location');
    showSnackbar('Tracking stopped');
  }

  function onPosition(pos) {
    lastPos = pos;
    pushLocation(pos);

    const { latitude: lat, longitude: lng, speed, heading, accuracy } = pos.coords;
    const speedKmh = speed ? Math.round(speed * 3.6) : 0;

    $('stat-speed').textContent = speedKmh;
    $('stat-acc').textContent = Math.round(accuracy);
    $('stat-heading').textContent = heading ? Math.round(heading) : '-';
    $('stat-updates').textContent = ++updateCount;
    $('speed-bar').style.width = Math.min(100, speedKmh / 120 * 100) + '%';

    const acc = accuracyLabel(accuracy);
    const chip = $('gps-chip');
    chip.className = 'map-overlay-chip top-right gps-chip ' + acc.cls;
    $('gps-chip-txt').textContent = `${acc.text} (+/-${Math.round(accuracy)}m)`;

    if (driverMap) {
      const latlng = [lat, lng];
      driverMap.setView(latlng, 15);
      if (driverMarker) driverMarker.setLatLng(latlng);
      else driverMarker = L.marker(latlng, { icon: makeBusIcon() }).addTo(driverMap);
    }

    setTrackingBar('active', 'Broadcasting Live', `+/-${Math.round(accuracy)}m - ${speedKmh} km/h - ${headingToCompass(heading || 0)}`);
  }

  function pushLocation(pos) {
    const { latitude: lat, longitude: lng, speed, heading, accuracy } = pos.coords;
    const payload = {
      bus_id: busId,
      lat,
      lng,
      speed: speed ? Math.round(speed * 3.6) : 0,
      heading: heading || 0,
      accuracy: Math.round(accuracy)
    };
    socket = socket || getSocket();
    socket.emit('driver:location', payload);
  }

  function onGpsError(err) {
    showSnackbar('GPS error: ' + err.message);
    setTrackingBar('waiting', 'GPS Error', err.message);
  }

  function setTrackingBar(state, main, sub) {
    $('tracking-bar').className = 'tracking-bar ' + state;
    $('tb-main').textContent = main;
    $('tb-sub').textContent = sub;
  }

  function startTripTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const seconds = Math.floor((Date.now() - tripStartedAt) / 1000);
      const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
      const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
      const s = String(seconds % 60).padStart(2, '0');
      $('trip-timer').textContent = `${h}:${m}:${s}`;
    }, 1000);
  }

  function makeBusIcon() {
    return L.divIcon({
      className: '',
      html: '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#1B6B45,#1565C0);display:flex;align-items:center;justify-content:center;font-size:18px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">BUS</div>',
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
  }

  $('route-lock-btn').addEventListener('click', function () {
    routeLocked = !routeLocked;
    this.classList.toggle('locked', routeLocked);
    this.innerHTML = routeLocked
      ? '<span class="material-icons-round" style="font-size:18px;">lock</span> ROUTE LOCKED'
      : '<span class="material-icons-round" style="font-size:18px;">lock_open</span> LOCK ROUTE';
    showSnackbar(routeLocked ? 'Route locked for this trip' : 'Route unlocked');
  });

  $('emergency-btn').addEventListener('click', () => $('emergency-modal').classList.add('open'));
  $('emergency-cancel').addEventListener('click', closeEmergency);
  document.querySelectorAll('.emergency-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.emergency-type-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedEmergency = btn.dataset.type;
    });
  });
  $('emergency-send').addEventListener('click', async () => {
    if (!selectedEmergency) { showSnackbar('Choose an emergency type'); return; }
    const payload = {
      bus_id: busId,
      type: selectedEmergency,
      label: selectedEmergency.toUpperCase(),
      note: $('emergency-note').value.trim(),
      lat: lastPos?.coords?.latitude,
      lng: lastPos?.coords?.longitude
    };
    const res = await TracerAPI.sendEmergency(payload);
    if (res?.error) showSnackbar(res.error);
    else {
      socket?.emit('driver:emergency', payload);
      showSnackbar('Emergency alert sent');
      closeEmergency();
    }
  });

  function closeEmergency() {
    $('emergency-modal').classList.remove('open');
  }

  $('logout-btn').addEventListener('click', async () => {
    if (isTracking) await stopTracking();
    TracerAPI.logout();
    driverUser = null;
    $('dashboard').style.display = 'none';
    $('auth-panel').style.display = 'block';
    $('logout-btn').style.display = 'none';
    $('login-btn').disabled = false;
    $('login-btn').innerHTML = '<span class="material-icons-round">login</span> SIGN IN & START';
    showSnackbar('Logged out successfully');
  });

  fillBusSelect();
})();
