// ================================================================
//  TRACER LIVE — Shared Utilities
// ================================================================

// Snackbar notification
function showSnackbar(msg, duration = 3000) {
  const sb = document.getElementById('snackbar');
  if (!sb) return;
  sb.textContent = msg;
  sb.classList.add('show');
  clearTimeout(sb._t);
  sb._t = setTimeout(() => sb.classList.remove('show'), duration);
}

// Format timestamp → "12:34 PM"
function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// Format "X seconds ago" / "X min ago"
function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5)  return 'Just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// Haversine distance in km
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function rad(d) { return d * Math.PI / 180; }

// GPS accuracy label
function accuracyLabel(m) {
  if (m <= 5)  return { text: 'Excellent', cls: 'gps-excellent' };
  if (m <= 15) return { text: 'Good', cls: 'gps-good' };
  if (m <= 40) return { text: 'Fair', cls: 'gps-fair' };
  return { text: 'Poor', cls: 'gps-poor' };
}

// Bus type badge
function busTypeBadge(type) {
  return type === 'local'
    ? '<span class="bus-type-badge local">🏙 Local</span>'
    : '<span class="bus-type-badge intercity">🛣 Intercity</span>';
}

// Status badge
function statusBadge(status) {
  return status === 'active'
    ? '<span class="status-dot active"></span><span class="status-text-live">LIVE</span>'
    : '<span class="status-dot inactive"></span><span>Offline</span>';
}

// Heading → compass direction
function headingToCompass(h) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(h / 45) % 8];
}

// Dark/light theme
function initTheme() {
  try {
    const saved = localStorage.getItem('tracer-theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = saved === 'dark' ? 'light_mode' : 'dark_mode';
  } catch (e) {}
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = next === 'dark' ? 'light_mode' : 'dark_mode';
  try { localStorage.setItem('tracer-theme', next); } catch (e) {}
}

// Simulate moving a demo bus location slightly
function simulateDemoMovement(loc, heading) {
  const speed = 0.00008;
  const h = (heading || 180) * Math.PI / 180;
  return {
    ...loc,
    lat: loc.lat + Math.cos(h) * speed * (0.8 + Math.random() * 0.4),
    lng: loc.lng + Math.sin(h) * speed * (0.8 + Math.random() * 0.4),
    speed: Math.max(10, Math.min(120, (loc.speed || 50) + (Math.random() - 0.5) * 8)),
    timestamp: Date.now()
  };
}
