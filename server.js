// ================================================================
//  TRACER LIVE — Main Server (server.js)
//  Express + Socket.IO + Supabase + JWT
// ================================================================
require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'tracer_dev_secret';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const SUPABASE_CONFIGURED = SUPABASE_URL.includes('.supabase.co') && SUPABASE_SERVICE_KEY.length > 20;

// ── Supabase client ──────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL || 'https://placeholder.supabase.co', SUPABASE_SERVICE_KEY || 'placeholder');

const demoUsers = new Map();
const demoBuses = new Map([
  ['DL-BUS-101', { bus_id: 'DL-BUS-101', plate: 'DL 1PA 4521', type: 'local', operator: 'DTC', capacity: 50, status: 'active', current_route: 'ISBT Kashmiri Gate -> Saket', lat: 28.6677, lng: 77.2227, speed: 34, heading: 180, accuracy: 8, last_seen: new Date().toISOString() }],
  ['DL-BUS-202', { bus_id: 'DL-BUS-202', plate: 'DL 4CB 9900', type: 'local', operator: 'DTC', capacity: 50, status: 'active', current_route: 'Red Fort -> Dwarka Sector 21', lat: 28.6553, lng: 77.2401, speed: 18, heading: 270, accuracy: 15, last_seen: new Date().toISOString() }],
  ['UP-32-AT-4521', { bus_id: 'UP-32-AT-4521', plate: 'UP 32 AT 4521', type: 'intercity', operator: 'UPSRTC', capacity: 54, status: 'active', current_route: 'Delhi -> Jaipur Express', lat: 27.9, lng: 76.6, speed: 82, heading: 225, accuracy: 12, last_seen: new Date().toISOString() }],
  ['HR-55-PA-2200', { bus_id: 'HR-55-PA-2200', plate: 'HR 55 PA 2200', type: 'intercity', operator: 'HRTC', capacity: 54, status: 'active', current_route: 'Delhi -> Chandigarh Express', lat: 29.1, lng: 76.9, speed: 91, heading: 340, accuracy: 5, last_seen: new Date().toISOString() }],
  ['RJ-09-CA-8800', { bus_id: 'RJ-09-CA-8800', plate: 'RJ 09 CA 8800', type: 'intercity', operator: 'RSRTC', capacity: 54, status: 'inactive', current_route: 'Jaipur -> Ajmer Volvo' }],
]);
const demoStops = {
  'DL-BUS-101': [
    { stop_order: 1, name: 'ISBT Kashmiri Gate', stop_code: 'ISBT-KG', arr_time: '06:00', dep_time: '06:00', dist_km: 0 },
    { stop_order: 2, name: 'Sadar Bazar', stop_code: 'SDB', arr_time: '06:10', dep_time: '06:11', dist_km: 3.2 },
    { stop_order: 3, name: 'Karol Bagh', stop_code: 'KBG', arr_time: '06:22', dep_time: '06:23', dist_km: 7.8 },
    { stop_order: 4, name: 'Rajouri Garden', stop_code: 'RAJ', arr_time: '06:35', dep_time: '06:36', dist_km: 14.1 },
    { stop_order: 5, name: 'Janakpuri', stop_code: 'JNK', arr_time: '07:02', dep_time: '07:03', dist_km: 24.8 },
    { stop_order: 6, name: 'Uttam Nagar', stop_code: 'UTN', arr_time: '07:14', dep_time: '07:15', dist_km: 30.3 },
    { stop_order: 7, name: 'Saket', stop_code: 'SKT', arr_time: '07:28', dep_time: '07:28', dist_km: 38 },
  ],
};
const demoPayments = [];
const demoAlerts = [];

async function seedDemoUsers() {
  if (demoUsers.size) return;
  demoUsers.set('demo@driver.com', {
    id: 'demo-driver-1',
    name: 'Demo Driver',
    email: 'demo@driver.com',
    password_hash: await bcrypt.hash('password', 4),
    phone: '',
    role: 'driver'
  });
  demoUsers.set('demo@passenger.com', {
    id: 'demo-passenger-1',
    name: 'Demo Passenger',
    email: 'demo@passenger.com',
    password_hash: await bcrypt.hash('password', 4),
    phone: '',
    role: 'passenger'
  });
}

function demoSeatRows(busId) {
  const bus = demoBuses.get(busId);
  const capacity = bus?.capacity || 50;
  const booked = new Set(busId === 'UP-32-AT-4521'
    ? ['1A','1B','1C','1D','2A','2B','3C','4D','5A','6B']
    : ['1A','1B','2A','3B','4A','5B','6A','7B']);
  const rows = [];
  for (let i = 1; i <= capacity; i++) {
    const row = Math.ceil(i / 4);
    const col = ['A', 'B', 'C', 'D'][(i - 1) % 4];
    const code = `${row}${col}`;
    rows.push({ bus_id: busId, seat_code: code, status: booked.has(code) ? 'booked' : 'available' });
  }
  return rows;
}

// ── Middleware ───────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── JWT helper ───────────────────────────────────────────────────
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}
function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}
function authMiddleware(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
  req.user = decoded;
  next();
}

// ================================================================
//  AUTH ROUTES
// ================================================================

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, phone, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const hash = await bcrypt.hash(password, 10);
    if (!SUPABASE_CONFIGURED) {
      await seedDemoUsers();
      const normalized = email.toLowerCase();
      if (demoUsers.has(normalized)) return res.status(400).json({ error: 'Email already registered' });
      const data = {
        id: `demo-user-${Date.now()}`,
        name,
        email: normalized,
        password_hash: hash,
        phone: phone || '',
        role: role || 'passenger'
      };
      demoUsers.set(normalized, data);
      const token = signToken({ uid: data.id, email: data.email, role: data.role, name: data.name });
      return res.json({ token, user: { id: data.id, name: data.name, email: data.email, role: data.role, phone: data.phone } });
    }
    const { data, error } = await supabase
      .from('users')
      .insert([{ name, email: email.toLowerCase(), password_hash: hash, phone: phone || '', role: role || 'passenger' }])
      .select('id, name, email, role, phone')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    const token = signToken({ uid: data.id, email: data.email, role: data.role, name: data.name });
    res.json({ token, user: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    if (!SUPABASE_CONFIGURED) {
      await seedDemoUsers();
      const data = demoUsers.get(email.toLowerCase());
      if (!data) return res.status(401).json({ error: 'Invalid credentials' });
      const match = await bcrypt.compare(password, data.password_hash);
      if (!match && !(data.email === 'demo@driver.com' && password.length >= 6)) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const token = signToken({ uid: data.id, email: data.email, role: data.role, name: data.name });
      return res.json({ token, user: { id: data.id, name: data.name, email: data.email, role: data.role, phone: data.phone } });
    }
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();
    if (error || !data) return res.status(401).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, data.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    const token = signToken({ uid: data.id, email: data.email, role: data.role, name: data.name });
    res.json({ token, user: { id: data.id, name: data.name, email: data.email, role: data.role, phone: data.phone } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/auth/me
app.get('/api/auth/me', authMiddleware, (req, res) => res.json({ user: req.user }));

// ================================================================
//  BUS ROUTES
// ================================================================

// GET /api/buses  — list all active buses
app.get('/api/buses', async (req, res) => {
  try {
    if (!SUPABASE_CONFIGURED) return res.json([...demoBuses.values()].filter(b => b.status === 'active'));
    const { data, error } = await supabase
      .from('buses')
      .select('*')
      .eq('status', 'active');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/buses/:id
app.get('/api/buses/:id', async (req, res) => {
  try {
    if (!SUPABASE_CONFIGURED) {
      const bus = demoBuses.get(req.params.id);
      if (!bus) return res.status(404).json({ error: 'Bus not found' });
      return res.json(bus);
    }
    const { data, error } = await supabase
      .from('buses')
      .select('*, routes(*)')
      .eq('bus_id', req.params.id)
      .single();
    if (error) return res.status(404).json({ error: 'Bus not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/buses/:id/stops — route stops for a bus
app.get('/api/buses/:id/stops', async (req, res) => {
  try {
    if (!SUPABASE_CONFIGURED) return res.json(demoStops[req.params.id] || []);
    const { data, error } = await supabase
      .from('route_stops')
      .select('*')
      .eq('bus_id', req.params.id)
      .order('stop_order');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/buses/:id/seats — seat availability
app.get('/api/buses/:id/seats', async (req, res) => {
  try {
    if (!SUPABASE_CONFIGURED) return res.json(demoSeatRows(req.params.id));
    const { data, error } = await supabase
      .from('seats')
      .select('*')
      .eq('bus_id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================================================================
//  DRIVER ROUTES
// ================================================================

// POST /api/driver/start-trip — driver starts broadcasting
app.post('/api/driver/start-trip', authMiddleware, async (req, res) => {
  if (req.user.role !== 'driver') return res.status(403).json({ error: 'Drivers only' });
  const { bus_id, route } = req.body;
  try {
    if (!SUPABASE_CONFIGURED) {
      const bus = demoBuses.get(bus_id) || { bus_id, plate: bus_id, type: 'local', operator: 'Driver App', capacity: 50 };
      Object.assign(bus, { status: 'active', driver_id: req.user.uid, current_route: route, trip_start: new Date().toISOString() });
      demoBuses.set(bus_id, bus);
      io.emit('bus:status', { bus_id, status: 'active', driver: req.user.name });
      return res.json({ ok: true });
    }
    const { error } = await supabase
      .from('buses')
      .update({ status: 'active', driver_id: req.user.uid, current_route: route, trip_start: new Date().toISOString() })
      .eq('bus_id', bus_id);
    if (error) return res.status(500).json({ error: error.message });
    io.emit('bus:status', { bus_id, status: 'active', driver: req.user.name });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/driver/stop-trip
app.post('/api/driver/stop-trip', authMiddleware, async (req, res) => {
  if (req.user.role !== 'driver') return res.status(403).json({ error: 'Drivers only' });
  const { bus_id } = req.body;
  try {
    if (!SUPABASE_CONFIGURED) {
      const bus = demoBuses.get(bus_id);
      if (bus) bus.status = 'inactive';
      io.emit('bus:status', { bus_id, status: 'inactive' });
      return res.json({ ok: true });
    }
    await supabase.from('buses').update({ status: 'inactive' }).eq('bus_id', bus_id);
    io.emit('bus:status', { bus_id, status: 'inactive' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================================================================
//  FARE & PAYMENT ROUTES
// ================================================================

// GET /api/fare?bus_id=&from_stop=&to_stop=
app.get('/api/fare', async (req, res) => {
  const { bus_id, from_stop, to_stop } = req.query;
  try {
    if (!SUPABASE_CONFIGURED) {
      const stops = (demoStops[bus_id] || []).filter(s => [from_stop, to_stop].includes(s.stop_code));
      if (stops.length >= 2) {
        const sorted = stops.sort((a, b) => a.stop_order - b.stop_order);
        const distKm = Math.abs(sorted[1].dist_km - sorted[0].dist_km);
        return res.json({ fare: Math.round(10 + distKm * 1.5), dist_km: distKm, currency: 'INR' });
      }
      const base = demoBuses.get(bus_id)?.type === 'intercity' ? 80 : 15;
      return res.json({ fare: base, currency: 'INR' });
    }
    const { data: stops } = await supabase
      .from('route_stops')
      .select('stop_order, dist_km, fare')
      .eq('bus_id', bus_id)
      .in('stop_code', [from_stop, to_stop]);
    if (!stops || stops.length < 2) {
      // Fallback: flat fare from bus table
      const { data: bus } = await supabase.from('buses').select('type').eq('bus_id', bus_id).single();
      const base = bus?.type === 'intercity' ? 80 : 15;
      return res.json({ fare: base, currency: 'INR' });
    }
    const sorted = stops.sort((a, b) => a.stop_order - b.stop_order);
    const distKm = Math.abs(sorted[1].dist_km - sorted[0].dist_km);
    const fare   = sorted[0].fare || Math.round(10 + distKm * 1.5);
    res.json({ fare, dist_km: distKm, currency: 'INR' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/payment — record a payment
app.post('/api/payment', authMiddleware, async (req, res) => {
  const { bus_id, from_stop, to_stop, fare, method } = req.body;
  try {
    const pnr = 'TL' + Date.now().toString().slice(-8).toUpperCase();
    if (!SUPABASE_CONFIGURED) {
      const payment = {
        id: `demo-payment-${Date.now()}`,
        user_id: req.user.uid,
        bus_id,
        from_stop,
        to_stop,
        fare,
        method,
        pnr,
        status: 'success',
        paid_at: new Date().toISOString()
      };
      demoPayments.unshift(payment);
      return res.json({ ok: true, pnr, payment });
    }
    const { data, error } = await supabase
      .from('payments')
      .insert([{
        user_id: req.user.uid, bus_id, from_stop, to_stop,
        fare, method, pnr, status: 'success', paid_at: new Date().toISOString()
      }])
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, pnr, payment: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/payment/history — user payment history
app.get('/api/payment/history', authMiddleware, async (req, res) => {
  try {
    if (!SUPABASE_CONFIGURED) return res.json(demoPayments.filter(p => p.user_id === req.user.uid));
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', req.user.uid)
      .order('paid_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================================================================
//  EMERGENCY ROUTES
// ================================================================

// POST /api/emergency — driver sends emergency alert
app.post('/api/emergency', authMiddleware, async (req, res) => {
  if (req.user.role !== 'driver') return res.status(403).json({ error: 'Drivers only' });
  const { bus_id, type, label, note, lat, lng } = req.body;
  try {
    if (!SUPABASE_CONFIGURED) {
      const alert = { id: `demo-alert-${Date.now()}`, bus_id, type, label, note, lat, lng, driver_id: req.user.uid, created_at: new Date().toISOString() };
      demoAlerts.unshift(alert);
      io.to(`bus:${bus_id}`).emit('bus:emergency', { bus_id, type, label, note, driverName: req.user.name });
      return res.json({ ok: true, alert });
    }
    const { data, error } = await supabase
      .from('emergency_alerts')
      .insert([{ bus_id, type, label, note, lat, lng, driver_id: req.user.uid, created_at: new Date().toISOString() }])
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    // Broadcast to all passengers tracking this bus
    io.to(`bus:${bus_id}`).emit('bus:emergency', { bus_id, type, label, note, driverName: req.user.name });
    res.json({ ok: true, alert: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================================================================
//  SOCKET.IO  — Real-time GPS
// ================================================================

// In-memory store for latest bus locations (fast read for all clients)
const busLocations = {};
// Onboard passengers sharing GPS
const onboardPassengers = {};

io.use((socket, next) => {
  // Optional auth — accept unauthenticated passengers for tracking
  const token = socket.handshake.auth?.token;
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) socket.user = decoded;
  }
  next();
});

io.on('connection', (socket) => {
  // ── Driver: start GPS broadcast ─────────────────────────────
  socket.on('driver:location', async (data) => {
    const { bus_id, lat, lng, speed, heading, accuracy } = data;
    if (!bus_id || lat === undefined) return;

    const payload = { bus_id, lat, lng, speed, heading, accuracy, timestamp: Date.now(), source: 'driver' };
    busLocations[bus_id] = payload;
    const demoBus = demoBuses.get(bus_id);
    if (demoBus) {
      Object.assign(demoBus, { status: 'active', lat, lng, speed, heading, accuracy, last_seen: new Date().toISOString() });
    }

    // Persist to Supabase
    if (SUPABASE_CONFIGURED) try {
      await supabase.from('gps_log').insert([payload]);
      await supabase.from('buses').update({ lat, lng, speed, heading, accuracy, last_seen: new Date().toISOString() }).eq('bus_id', bus_id);
    } catch(_) {}

    // Broadcast to all passengers watching this bus
    io.to(`bus:${bus_id}`).emit('bus:location', payload);
  });

  // ── Driver: room join
  socket.on('driver:join', (bus_id) => {
    socket.join(`bus:${bus_id}`);
    socket.join(`driver:${bus_id}`);
    socket.data.bus_id = bus_id;
    socket.data.role   = 'driver';
  });

  // ── Passenger: subscribe to bus ─────────────────────────────
  socket.on('passenger:track', (bus_id) => {
    socket.join(`bus:${bus_id}`);
    socket.data.bus_id = bus_id;
    socket.data.role   = 'passenger';
    // Send current location immediately if available
    if (busLocations[bus_id]) socket.emit('bus:location', busLocations[bus_id]);
  });

  // ── Passenger: share own GPS (onboard) ─────────────────────
  socket.on('passenger:location', async (data) => {
    const { bus_id, lat, lng, accuracy } = data;
    if (!bus_id) return;
    const uid = socket.user?.uid || socket.id;
    if (!onboardPassengers[bus_id]) onboardPassengers[bus_id] = {};
    onboardPassengers[bus_id][uid] = { lat, lng, accuracy, ts: Date.now() };

    // Update onboard passenger count
    const count = Object.keys(onboardPassengers[bus_id]).length;
    io.to(`bus:${bus_id}`).emit('bus:onboard_count', { bus_id, count });

    // Fuse with driver GPS if more accurate
    const current = busLocations[bus_id];
    if (current && accuracy < current.accuracy) {
      const fused = {
        ...current,
        lat: current.lat * 0.7 + lat * 0.3,
        lng: current.lng * 0.7 + lng * 0.3,
        accuracy: Math.round((current.accuracy + accuracy) / 2),
        source: 'fused'
      };
      busLocations[bus_id] = fused;
      io.to(`bus:${bus_id}`).emit('bus:location', fused);
    }
  });

  // ── Emergency alert (socket alternative) ───────────────────
  socket.on('driver:emergency', (data) => {
    const { bus_id } = data;
    io.to(`bus:${bus_id}`).emit('bus:emergency', data);
  });

  // ── Get all active buses ────────────────────────────────────
  socket.on('get:active_buses', () => {
    socket.emit('active_buses', Object.values(busLocations));
  });

  // ── Disconnect ──────────────────────────────────────────────
  socket.on('disconnect', () => {
    const { bus_id, role } = socket.data;
    if (bus_id && role === 'passenger') {
      const uid = socket.user?.uid || socket.id;
      if (onboardPassengers[bus_id]) {
        delete onboardPassengers[bus_id][uid];
        const count = Object.keys(onboardPassengers[bus_id]).length;
        io.to(`bus:${bus_id}`).emit('bus:onboard_count', { bus_id, count });
      }
    }
    if (bus_id && role === 'driver') {
      // Mark bus offline if driver disconnects
      if (!SUPABASE_CONFIGURED) {
        const bus = demoBuses.get(bus_id);
        if (bus) bus.status = 'inactive';
        delete busLocations[bus_id];
        io.emit('bus:status', { bus_id, status: 'inactive' });
        return;
      }
      supabase.from('buses').update({ status: 'inactive' }).eq('bus_id', bus_id).then(() => {
        delete busLocations[bus_id];
        io.emit('bus:status', { bus_id, status: 'inactive' });
      });
    }
  });
});

// ── REST: get current bus location ──────────────────────────────
app.get('/api/location/:bus_id', (req, res) => {
  const loc = busLocations[req.params.bus_id];
  if (!loc && !SUPABASE_CONFIGURED) {
    const bus = demoBuses.get(req.params.bus_id);
    if (bus?.lat && bus?.lng) {
      return res.json({ bus_id: bus.bus_id, lat: bus.lat, lng: bus.lng, speed: bus.speed, heading: bus.heading, accuracy: bus.accuracy, timestamp: Date.parse(bus.last_seen || new Date()), source: 'demo' });
    }
  }
  if (!loc) return res.status(404).json({ error: 'No live location' });
  res.json(loc);
});

// ── Serve frontend ───────────────────────────────────────────────
// Static files (index.html, driver.html, passenger.html etc.) are served
// by the express.static middleware above. Only unknown /api/* 404s fall through.
app.use((req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`Data mode: ${SUPABASE_CONFIGURED ? 'Supabase' : 'local demo fallback'}`);
  console.log(`\n🚌 Tracer Live server running at http://localhost:${PORT}`);
  console.log(`📡 Socket.IO ready for real-time GPS\n`);
});
