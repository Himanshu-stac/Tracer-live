// ================================================================
//  TRACER LIVE — Passenger App (WIMT-style)
// ================================================================

(function () {
  initTheme();
  document.getElementById('theme-btn').addEventListener('click', () => { toggleTheme(); refreshMapTiles(); });

  // ---- Map instances ----
  let mapMini = null, mapFull = null, mapDesktop = null;
  let markersMini = {}, markersDesktop = {}, markerFull = null;
  let mapMiniInit = false, mapDesktopInit = false, mapFullInit = false;

  // ---- State ----
  let trackedBusId = null;
  let busData = { ...DEMO_BUSES };  // live copy
  let stopProgress = { ...BUS_CURRENT_STOP }; // mutable stop idx per bus
  let demoInterval = null;
  let socket = null;
  let passengerWatchId = null;
  let onboardChoice = null;

  // ================================================================
  //  MAP INIT
  // ================================================================
  function getTileUrl() {
    return document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  }

  function initMiniMap() {
    if (mapMiniInit) return;
    mapMiniInit = true;
    mapMini = L.map('map-mini', { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false });
    L.tileLayer(getTileUrl(), { maxZoom: 18 }).addTo(mapMini);
    mapMini.setView([22.5, 80], 5);
  }

  function initDesktopMap() {
    if (mapDesktopInit) return;
    mapDesktopInit = true;
    mapDesktop = L.map('map', { zoomControl: false, attributionControl: false });
    L.tileLayer(getTileUrl(), { maxZoom: 18 }).addTo(mapDesktop);
    L.control.zoom({ position: 'bottomright' }).addTo(mapDesktop);
    mapDesktop.setView([22.5, 80], 5);
  }

  function initFullMap() {
    if (mapFullInit) return;
    mapFullInit = true;
    mapFull = L.map('map-full', { zoomControl: true, attributionControl: false });
    L.tileLayer(getTileUrl(), { maxZoom: 18 }).addTo(mapFull);
    mapFull.setView([22.5, 80], 5);
  }

  function refreshMapTiles() {
    [mapMini, mapFull, mapDesktop].forEach(m => {
      if (!m) return;
      m.eachLayer(l => { if (l._url) m.removeLayer(l); });
      L.tileLayer(getTileUrl(), { maxZoom: 18 }).addTo(m);
    });
  }

  // Check if desktop layout
  function isDesktop() { return window.innerWidth >= 900; }

  // Init desktop map on load
  if (isDesktop()) initDesktopMap();
  window.addEventListener('resize', () => {
    if (isDesktop() && !mapDesktopInit) initDesktopMap();
    [mapMini, mapDesktop, mapFull].forEach(m => m && setTimeout(() => m.invalidateSize(), 80));
  });

  function normalizeBus(raw) {
    const id = raw.bus_id || raw.id || raw.info?.busNumber;
    if (!id) return null;
    const route = raw.current_route || raw.route || raw.info?.route || '';
    const [fromRoute, toRoute] = route.includes('->') ? route.split('->').map(x => x.trim()) : [];
    const existing = busData[id] || {};
    return {
      ...existing,
      info: {
        ...(existing.info || {}),
        busNumber: id,
        plate: raw.plate || raw.info?.plate || id,
        type: raw.type || raw.info?.type || 'local',
        route,
        from: raw.from || raw.info?.from || fromRoute || 'Origin',
        to: raw.to || raw.info?.to || toRoute || 'Destination',
        operator: raw.operator || raw.info?.operator || 'Tracer Live',
        driverName: raw.driverName || raw.info?.driverName || 'Assigned driver',
        capacity: raw.capacity || raw.info?.capacity || 50
      },
      location: raw.lat && raw.lng ? {
        lat: Number(raw.lat),
        lng: Number(raw.lng),
        speed: Number(raw.speed || 0),
        heading: Number(raw.heading || 0),
        accuracy: Number(raw.accuracy || 0),
        timestamp: raw.last_seen ? Date.parse(raw.last_seen) : Date.now()
      } : (raw.location || existing.location),
      status: raw.status || existing.status || 'active',
      delay: existing.delay || 0,
      seatsBooked: existing.seatsBooked || 0
    };
  }

  function normalizeStops(rows) {
    return (rows || []).map(s => ({
      name: s.name,
      code: s.stop_code || s.code,
      arr: s.arr_time || s.arr,
      dep: s.dep_time || s.dep,
      dist: Number(s.dist_km ?? s.dist ?? 0)
    }));
  }

  async function loadBackendBuses() {
    try {
      const rows = await TracerAPI.getBuses();
      if (Array.isArray(rows) && rows.length) {
        rows.forEach(row => {
          const normalized = normalizeBus(row);
          if (normalized) busData[normalized.info.busNumber] = normalized;
        });
        renderActiveBusChips();
        updateAllBusMarkers();
      }
    } catch (e) {
      console.warn('Using demo buses:', e.message);
    }
  }

  function initRealtime() {
    socket = getSocket();
    socket.on('bus:location', payload => {
      const id = payload.bus_id;
      if (!id || !busData[id]) return;
      busData[id].location = {
        lat: payload.lat,
        lng: payload.lng,
        speed: payload.speed || 0,
        heading: payload.heading || 0,
        accuracy: payload.accuracy || 0,
        timestamp: payload.timestamp || Date.now()
      };
      if (trackedBusId === id) updateAllViews(id);
      updateAllBusMarkers();
    });
    socket.on('bus:status', data => {
      if (!data?.bus_id) return;
      if (busData[data.bus_id]) busData[data.bus_id].status = data.status;
      renderActiveBusChips();
      renderBusList();
    });
    socket.on('bus:onboard_count', data => {
      if (data.bus_id === trackedBusId) document.getElementById('onbus-count').textContent = `${data.count || 0} onboard`;
    });
    socket.on('bus:emergency', data => {
      if (!trackedBusId || data.bus_id === trackedBusId) {
        showSnackbar(`Emergency alert: ${data.label || data.type || 'Driver alert'}`, 6000);
      }
    });
  }

  // ================================================================
  //  DEMO SIMULATION
  // ================================================================
  function startDemoSimulation() {
    if (demoInterval) clearInterval(demoInterval);
    demoInterval = setInterval(() => {
      Object.keys(DEMO_BUSES).forEach(id => {
        const b = busData[id];
        if (!b) return;
        b.location = simulateDemoMovement(b.location, b.location.heading);
        b.location.timestamp = Date.now();
      });
      // Occasionally advance a stop (every ~40s)
      if (Math.random() < 0.05 && trackedBusId) {
        const stops = BUS_STOPS[trackedBusId];
        if (stops && stopProgress[trackedBusId] < stops.length - 2) {
          stopProgress[trackedBusId]++;
          showSnackbar('📍 Bus passed a stop');
        }
      }
      if (trackedBusId) {
        updateAllViews(trackedBusId);
      }
      updateAllBusMarkers();
    }, 3500);
  }

  function updateAllBusMarkers() {
    if (!trackedBusId) {
      renderActiveBusChips();
    }
    // Update desktop markers
    if (mapDesktop) {
      Object.entries(busData).forEach(([id, b]) => {
        if (!b?.location) return;
        const ll = [b.location.lat, b.location.lng];
        if (markersDesktop[id]) {
          animateMarker(markersDesktop[id], ll);
        } else {
          markersDesktop[id] = L.marker(ll, { icon: makeBusIcon(b.info?.type, id === trackedBusId) }).addTo(mapDesktop);
          markersDesktop[id].on('click', () => selectBus(id));
        }
      });
    }
  }

  // ================================================================
  //  SELECT BUS
  // ================================================================
  async function selectBus(id) {
    const bus = busData[id];
    if (!bus) { showSnackbar('Bus not found or offline'); return; }
    trackedBusId = id;
    onboardChoice = null;

    document.getElementById('search-state').style.display = 'none';
    document.getElementById('tracking-panel').style.display = 'flex';
    document.getElementById('tracking-panel').style.flexDirection = 'column';
    document.getElementById('tracking-panel').style.height = '100%';
    document.getElementById('tracking-panel').style.overflow = 'hidden';
    document.getElementById('topbar-sub').textContent = `Tracking ${id}`;

    // Init mini map
    initMiniMap();
    setTimeout(() => {
      mapMini.invalidateSize();
      mapMini.setView([bus.location.lat, bus.location.lng], 13);
    }, 100);

    // Init desktop map & fly
    if (isDesktop()) {
      initDesktopMap();
      mapDesktop.flyTo([bus.location.lat, bus.location.lng], 13, { duration: 1.5 });
      // Update icon to "tracked"
      Object.entries(markersDesktop).forEach(([mid, m]) => m.setIcon(makeBusIcon(busData[mid]?.info?.type, mid === id)));
    }

    if (socket) socket.emit('passenger:track', id);
    await loadBusDetails(id);
    updateAllViews(id);
    showSnackbar(`📍 Now tracking ${id}`);
  }

  async function loadBusDetails(id) {
    try {
      const fallbackStops = BUS_STOPS[id] || [];
      const [stops, seats, fare] = await Promise.all([
        TracerAPI.getBusStops(id),
        TracerAPI.getBusSeats(id),
        TracerAPI.getFare(id, fallbackStops[0]?.code || '', fallbackStops.slice(-1)[0]?.code || '')
      ]);
      const normalizedStops = normalizeStops(stops);
      if (normalizedStops.length) {
        BUS_STOPS[id] = normalizedStops;
        if (stopProgress[id] === undefined) stopProgress[id] = 0;
      }
      if (Array.isArray(seats)) {
        document.getElementById('sf-seats').textContent = seats.filter(s => s.status === 'available').length;
      } else {
        document.getElementById('sf-seats').textContent = Math.max(0, (busData[id].info.capacity || 50) - (busData[id].seatsBooked || 0));
      }
      document.getElementById('sf-fare').textContent = fare?.fare ? `₹${fare.fare}` : '₹--';
    } catch (e) {
      document.getElementById('sf-seats').textContent = Math.max(0, (busData[id].info.capacity || 50) - (busData[id].seatsBooked || 0));
      document.getElementById('sf-fare').textContent = busData[id].info.type === 'intercity' ? '₹80+' : '₹15+';
    }
    document.getElementById('sf-pay-btn').href = `tickets.html?bus=${encodeURIComponent(id)}`;
    resetOnbusPrompt();
  }

  // ================================================================
  //  UPDATE ALL VIEWS
  // ================================================================
  function updateAllViews(id) {
    const bus = busData[id];
    if (!bus?.location) return;
    const stops = BUS_STOPS[id] || [];
    const curIdx = stopProgress[id] ?? 0;
    const delay = bus.delay || 0;
    const spd = Math.round(bus.location.speed || 0);
    const heading = headingToCompass(bus.location.heading || 0);

    // Status card
    document.getElementById('sc-bus-num').textContent = bus.info?.busNumber || id;
    document.getElementById('sc-route').textContent = `${bus.info?.from || '—'} → ${bus.info?.to || '—'}`;
    document.getElementById('sc-speed').textContent = spd;
    document.getElementById('sc-delay').textContent = delay;
    document.getElementById('sc-heading').textContent = heading;
    document.getElementById('sc-acc').textContent = bus.location.accuracy || '—';
    const tag = document.getElementById('sc-status-tag');
    const card = document.getElementById('status-card');
    if (delay === 0) {
      tag.textContent = 'ON TIME'; tag.className = 'sc-status-tag ontime'; card.className = 'status-card ontime';
    } else {
      tag.textContent = `${delay} MIN LATE`; tag.className = 'sc-status-tag delayed'; card.className = 'status-card delayed';
    }

    // Journey progress
    const totalStops = stops.length;
    const pct = totalStops > 1 ? Math.round((curIdx / (totalStops - 1)) * 100) : 0;
    document.getElementById('jp-from').textContent = stops[0]?.name?.split(' ')[0] || '—';
    document.getElementById('jp-to').textContent = stops[totalStops - 1]?.name?.split(' ')[0] || '—';
    document.getElementById('jp-pct').textContent = pct + '%';
    document.getElementById('jp-fill').style.width = pct + '%';

    // Next stop banner
    const nextStop = stops[curIdx + 1];
    if (nextStop) {
      document.getElementById('nsb-name').textContent = nextStop.name;
      document.getElementById('nsb-eta').textContent = nextStop.arr;
      const distKm = nextStop.dist - (stops[curIdx]?.dist || 0);
      document.getElementById('nsb-dist').textContent = `≈ ${distKm.toFixed(1)} km away`;
    }

    // Stop count
    document.getElementById('tl-stop-count').textContent = `${curIdx + 1} / ${totalStops} stops done`;

    // Timeline
    renderTimeline(id, stops, curIdx, delay);

    // Update map markers
    updateMiniMapMarker(bus);
    if (isDesktop() && mapDesktop) {
      if (markersDesktop[id]) {
        animateMarker(markersDesktop[id], [bus.location.lat, bus.location.lng]);
      }
    }
  }

  // ================================================================
  //  TIMELINE RENDER
  // ================================================================
  function renderTimeline(busId, stops, curIdx, delay) {
    const container = document.getElementById('timeline-container');
    if (!stops.length) { container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-hint)">No stop data available</div>'; return; }

    let html = '';
    stops.forEach((stop, i) => {
      const isDeparted = i < curIdx;
      const isCurrent = i === curIdx;
      const isNext = i === curIdx + 1;
      const isLast = i === stops.length - 1;
      const isUpcoming = i > curIdx;

      // Dot class
      let dotCls = 'upcoming';
      if (isLast) dotCls = 'last-stop';
      if (isCurrent) dotCls = 'current-dot';
      if (isDeparted) dotCls = 'departed';

      // Line class (line after this stop, going to next)
      const lineBeforeCls = isDeparted ? 'traveled' : (isCurrent ? 'partial' : '');

      // Name class
      let nameCls = '';
      if (isDeparted) nameCls = 'departed';
      if (isCurrent) nameCls = 'current-name';

      // Time classes
      let timeValCls = 'upcoming-time';
      if (isDeparted) timeValCls = 'departed-time';
      if (isCurrent) timeValCls = 'current-time';

      // Chips
      let chips = '';
      if (isDeparted) chips += `<span class="tl-departed-chip">✓ PASSED</span>`;
      if (isCurrent) chips += `<div class="live-badge" style="margin-left:0"><span class="live-dot"></span>BUS HERE</div>`;
      if (isNext && delay > 0) chips += `<span class="tl-delay-chip">+${delay} min</span>`;
      if (isLast) chips += `<span class="tl-code" style="background:rgba(2,136,209,0.1);color:var(--accent);">DESTINATION</span>`;

      const rowCls = isCurrent ? 'tl-row current-row' : 'tl-row';

      html += `
      <div class="${rowCls}" data-idx="${i}">
        <div class="tl-gutter">
          ${i > 0 ? `<div class="tl-line-seg ${lineBeforeCls}" style="height:14px;"></div>` : ''}
          <div class="tl-dot-wrap">
            <div class="tl-dot ${dotCls}"></div>
          </div>
          ${!isLast ? `<div class="tl-line-seg ${isCurrent ? 'partial' : (isDeparted ? 'traveled' : '')}" style="flex:1;"></div>` : ''}
          ${isCurrent ? `<div class="tl-bus-on-line">🚌</div>` : ''}
        </div>
        <div class="tl-info">
          <div class="tl-stop-name ${nameCls}">
            ${stop.name}
            <span class="tl-code">${stop.code}</span>
          </div>
          <div class="tl-times">
            <span class="tl-time-lbl">${isDeparted ? 'Dep' : 'Arr'}</span>
            <span class="tl-time-val ${timeValCls}">${isDeparted ? stop.dep : stop.arr}</span>
            ${chips}
          </div>
          <div class="tl-dist">${stop.dist} km from origin</div>
        </div>
        <div class="tl-right-time">
          <div class="tl-sched-time ${isDeparted ? 'departed' : ''}">${stop.arr}</div>
          ${isDeparted ? `<div class="tl-actual-time ontime">✓ Done</div>` : ''}
          ${(isNext && delay > 0) ? `<div class="tl-actual-time delayed">+${delay}m</div>` : ''}
        </div>
      </div>`;
    });

    container.innerHTML = html;

    // Auto-scroll to current stop
    setTimeout(() => {
      const curRow = container.querySelector('.current-row');
      if (curRow) curRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  }

  // ================================================================
  //  MINI MAP UPDATE
  // ================================================================
  function updateMiniMapMarker(bus) {
    if (!mapMini) return;
    const ll = [bus.location.lat, bus.location.lng];
    if (markersMini.main) {
      animateMarker(markersMini.main, ll);
    } else {
      markersMini.main = L.marker(ll, { icon: makeBusIcon(bus.info?.type, true) }).addTo(mapMini);
    }
    mapMini.panTo(ll, { animate: true, duration: 1 });
  }

  // ================================================================
  //  BUS ICON
  // ================================================================
  function makeBusIcon(type, isTracked) {
    const bg = isTracked
      ? 'linear-gradient(135deg,#C62828,#E53935)'
      : (type === 'local' ? 'linear-gradient(135deg,#1565C0,#1976D2)' : 'linear-gradient(135deg,#1B6B45,#27AE60)');
    const pulse = isTracked ? 'animation:marker-pulse 2s infinite;' : '';
    return L.divIcon({
      className: '',
      html: `<div style="width:36px;height:36px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:18px;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.3);${pulse}">${type === 'local' ? '🚌' : '🚍'}</div>`,
      iconSize: [36, 36], iconAnchor: [18, 18]
    });
  }

  // ================================================================
  //  ANIMATE MARKER
  // ================================================================
  function animateMarker(marker, target, steps = 18) {
    const s = marker.getLatLng();
    const dLat = (target[0] - s.lat) / steps, dLng = (target[1] - s.lng) / steps;
    let step = 0;
    const iv = setInterval(() => {
      if (step >= steps) { clearInterval(iv); return; }
      marker.setLatLng([s.lat + dLat * step, s.lng + dLng * step]);
      step++;
    }, 3500 / steps);
  }

  function resetOnbusPrompt() {
    onboardChoice = null;
    document.getElementById('onbus-prompt').style.display = '';
    document.getElementById('onbus-status').style.display = 'none';
  }

  function stopPassengerSharing() {
    if (passengerWatchId !== null) {
      navigator.geolocation.clearWatch(passengerWatchId);
      passengerWatchId = null;
    }
  }

  function startPassengerSharing() {
    if (!trackedBusId) return;
    if (!('geolocation' in navigator)) {
      showSnackbar('Geolocation is not supported on this device');
      return;
    }
    onboardChoice = 'yes';
    document.getElementById('onbus-prompt').style.display = 'none';
    document.getElementById('onbus-status').style.display = 'flex';
    stopPassengerSharing();
    passengerWatchId = navigator.geolocation.watchPosition(pos => {
      getSocket().emit('passenger:location', {
        bus_id: trackedBusId,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy || 0)
      });
    }, err => {
      showSnackbar('Passenger GPS error: ' + err.message);
      resetOnbusPrompt();
    }, { enableHighAccuracy: true, maximumAge: 4000, timeout: 12000 });
    showSnackbar('Your GPS is improving live tracking');
  }

  document.getElementById('onbus-yes').addEventListener('click', startPassengerSharing);
  document.getElementById('onbus-no').addEventListener('click', () => {
    onboardChoice = 'no';
    stopPassengerSharing();
    document.getElementById('onbus-prompt').style.display = 'none';
    document.getElementById('onbus-status').style.display = 'none';
    showSnackbar('Showing driver and onboard passenger GPS');
  });

  // ================================================================
  //  ACTIVE BUS CHIPS
  // ================================================================
  function renderActiveBusChips() {
    const el = document.getElementById('active-chips');
    el.innerHTML = Object.entries(busData).map(([id, b]) =>
      `<div class="active-chip" onclick="window._pick('${id}')">
        ${b.info?.type === 'local' ? '🚌' : '🚍'} ${id}
      </div>`
    ).join('');
  }
  window._pick = (id) => selectBus(id);

  // ================================================================
  //  BUS LIST OVERLAY
  // ================================================================
  function renderBusList() {
    const el = document.getElementById('bus-list-content');
    el.innerHTML = Object.entries(busData).map(([id, b]) => `
      <div class="bus-card" onclick="window._pickAndClose('${id}')">
        <div class="bus-card-icon">${b.info?.type === 'local' ? '🚌' : '🚍'}</div>
        <div class="bus-card-main">
          <div class="bus-card-num">${id}</div>
          <div class="bus-card-route">${b.info?.from || '—'} → ${b.info?.to || '—'}</div>
          <div class="bus-card-meta">
            ${busTypeBadge(b.info?.type || 'local')}
            <div class="live-badge"><span class="live-dot"></span>LIVE</div>
          </div>
        </div>
        <div class="bus-card-right">
          <div class="bus-card-speed">${Math.round(b.location?.speed || 0)}</div>
          <div class="bus-card-speed-lbl">km/h</div>
          <div class="bus-card-time">${timeAgo(b.location?.timestamp || Date.now())}</div>
        </div>
      </div>`).join('');
  }
  window._pickAndClose = (id) => {
    document.getElementById('bus-list-overlay').style.display = 'none';
    selectBus(id);
  };

  document.getElementById('bus-list-btn').addEventListener('click', () => {
    renderBusList();
    document.getElementById('bus-list-overlay').style.display = 'flex';
  });
  document.getElementById('bus-list-bg').addEventListener('click', () => {
    document.getElementById('bus-list-overlay').style.display = 'none';
  });
  document.getElementById('close-bus-list').addEventListener('click', () => {
    document.getElementById('bus-list-overlay').style.display = 'none';
  });

  // ================================================================
  //  SEARCH
  // ================================================================
  document.getElementById('search-btn').addEventListener('click', doSearch);
  document.getElementById('bus-search').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  function doSearch() {
    const q = document.getElementById('bus-search').value.trim().toUpperCase();
    if (!q) { showSnackbar('Enter a Bus ID first'); return; }
    if (busData[q]) { selectBus(q); }
    else { showSnackbar(`Bus ${q} not found or offline`); }
  }

  // ================================================================
  //  FULLSCREEN MAP (mobile)
  // ================================================================
  document.getElementById('expand-map-btn').addEventListener('click', () => {
    document.getElementById('map-fullscreen').classList.add('show');
    initFullMap();
    setTimeout(() => {
      mapFull.invalidateSize();
      if (trackedBusId && busData[trackedBusId]) {
        const loc = busData[trackedBusId].location;
        mapFull.setView([loc.lat, loc.lng], 14);
        if (markerFull) mapFull.removeLayer(markerFull);
        markerFull = L.marker([loc.lat, loc.lng], { icon: makeBusIcon(busData[trackedBusId].info?.type, true) }).addTo(mapFull);
      }
    }, 200);
  });
  document.getElementById('close-fullmap').addEventListener('click', () => {
    document.getElementById('map-fullscreen').classList.remove('show');
  });

  // ================================================================
  //  DESKTOP FIT ALL
  // ================================================================
  document.getElementById('fit-all-btn')?.addEventListener('click', () => {
    if (!mapDesktop) return;
    const group = L.featureGroup(Object.values(markersDesktop));
    if (group.getLayers().length) mapDesktop.fitBounds(group.getBounds().pad(0.15));
  });

  // ================================================================
  //  AUTO-SELECT FROM LANDING PAGE
  // ================================================================
  try {
    const pre = sessionStorage.getItem('tracer-track-bus');
    if (pre) { sessionStorage.removeItem('tracer-track-bus'); setTimeout(() => selectBus(pre), 800); }
  } catch (e) { }

  // ================================================================
  //  BOOT
  // ================================================================
  initRealtime();
  loadBackendBuses().finally(() => {
    renderActiveBusChips();
    updateAllBusMarkers();
    startDemoSimulation();
  });

})();
