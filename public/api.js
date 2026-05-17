// ================================================================
//  TRACER LIVE — Client API Module (api.js)
//  Replaces firebase-config.js — connects to Node.js backend
// ================================================================

const API_BASE = window.location.origin; // same-origin
const DEMO_MODE = false; // Real backend mode

// ── Auth token helpers ───────────────────────────────────────────
const TracerAPI = {
  _token: null,

  getToken() {
    if (!this._token) this._token = localStorage.getItem('tracer_jwt');
    return this._token;
  },
  setToken(t) { this._token = t; localStorage.setItem('tracer_jwt', t); },
  clearToken() { this._token = null; localStorage.removeItem('tracer_jwt'); },
  authHeaders() {
    const t = this.getToken();
    return t ? { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' }
             : { 'Content-Type': 'application/json' };
  },

  async post(path, body) {
    const r = await fetch(API_BASE + path, { method: 'POST', headers: this.authHeaders(), body: JSON.stringify(body) });
    return r.json();
  },
  async get(path) {
    const r = await fetch(API_BASE + path, { headers: this.authHeaders() });
    return r.json();
  },

  // ── Auth ──────────────────────────────────────────────────────
  async register(name, email, password, phone, role) {
    const d = await this.post('/api/auth/register', { name, email, password, phone, role: role || 'passenger' });
    if (d.token) this.setToken(d.token);
    return d;
  },
  async login(email, password) {
    const d = await this.post('/api/auth/login', { email, password });
    if (d.token) this.setToken(d.token);
    return d;
  },
  async me() { return this.get('/api/auth/me'); },
  logout() { this.clearToken(); },

  // ── Buses ─────────────────────────────────────────────────────
  async getBuses()     { return this.get('/api/buses'); },
  async getBus(id)     { return this.get('/api/buses/' + id); },
  async getBusStops(id){ return this.get('/api/buses/' + id + '/stops'); },
  async getBusSeats(id){ return this.get('/api/buses/' + id + '/seats'); },
  async getLiveLocation(id){ return this.get('/api/location/' + id); },

  // ── Driver ────────────────────────────────────────────────────
  async startTrip(bus_id, route)  { return this.post('/api/driver/start-trip', { bus_id, route }); },
  async stopTrip(bus_id)          { return this.post('/api/driver/stop-trip',  { bus_id }); },

  // ── Fare & Payment ────────────────────────────────────────────
  async getFare(bus_id, from_stop, to_stop) {
    return this.get(`/api/fare?bus_id=${bus_id}&from_stop=${from_stop}&to_stop=${to_stop}`);
  },
  async pay(data) { return this.post('/api/payment', data); },
  async payHistory() { return this.get('/api/payment/history'); },

  // ── Emergency ─────────────────────────────────────────────────
  async sendEmergency(data) { return this.post('/api/emergency', data); },
};

// ── Socket.IO connection ─────────────────────────────────────────
// (socket.io client is loaded via CDN in each HTML page)
let _socket = null;

function getSocket() {
  if (_socket && _socket.connected) return _socket;
  _socket = io(API_BASE, {
    auth: { token: TracerAPI.getToken() },
    reconnectionAttempts: 10,
    reconnectionDelay: 2000
  });
  _socket.on('connect', () => console.log('🔌 Socket connected:', _socket.id));
  _socket.on('disconnect', () => console.warn('⚠ Socket disconnected'));
  return _socket;
}

// ── Demo data fallback (shown when Supabase not configured) ──────
const DEMO_BUSES = {
  "DL-BUS-101": {
    info: { busNumber:"DL-BUS-101", plate:"DL 1PA 4521", type:"local", route:"Route 10A", from:"ISBT Kashmiri Gate", to:"Saket", operator:"DTC", driverName:"Ramesh Kumar", capacity:50 },
    location: { lat:28.6677, lng:77.2227, speed:34, heading:180, accuracy:8, timestamp:Date.now() },
    status:"active", delay:0, seatsBooked:13
  },
  "UP-32-AT-4521": {
    info: { busNumber:"UP-32-AT-4521", plate:"UP 32 AT 4521", type:"intercity", route:"Delhi→Jaipur Express", from:"ISBT Delhi", to:"Sindhi Camp Jaipur", operator:"RSRTC", driverName:"Suresh Sharma", capacity:54 },
    location: { lat:27.9, lng:76.6, speed:82, heading:225, accuracy:12, timestamp:Date.now() },
    status:"active", delay:7, seatsBooked:22
  },
  "HR-55-PA-2200": {
    info: { busNumber:"HR-55-PA-2200", plate:"HR 55 PA 2200", type:"intercity", route:"Delhi→Chandigarh", from:"ISBT Delhi", to:"ISBT Sec 43 CHD", operator:"HRTC", driverName:"Gurpreet Singh", capacity:54 },
    location: { lat:29.1, lng:76.9, speed:91, heading:340, accuracy:5, timestamp:Date.now() },
    status:"active", delay:0, seatsBooked:18
  },
  "DL-BUS-202": {
    info: { busNumber:"DL-BUS-202", plate:"DL 4CB 9900", type:"local", route:"Route 22B", from:"Red Fort", to:"Dwarka Sector 21", operator:"DTC", driverName:"Manoj Verma", capacity:50 },
    location: { lat:28.6553, lng:77.2401, speed:18, heading:270, accuracy:15, timestamp:Date.now() },
    status:"active", delay:3, seatsBooked:10
  }
};

const BUS_STOPS = {
  "DL-BUS-101": [
    { name:"ISBT Kashmiri Gate", code:"ISBT-KG", arr:"06:00", dep:"06:00", dist:0 },
    { name:"Sadar Bazar",        code:"SDB",      arr:"06:10", dep:"06:11", dist:3.2 },
    { name:"Karol Bagh",         code:"KBG",      arr:"06:22", dep:"06:23", dist:7.8 },
    { name:"Rajouri Garden",     code:"RAJ",      arr:"06:35", dep:"06:36", dist:14.1 },
    { name:"Janakpuri",          code:"JNK",      arr:"07:02", dep:"07:03", dist:24.8 },
    { name:"Uttam Nagar",        code:"UTN",      arr:"07:14", dep:"07:15", dist:30.3 },
    { name:"Saket",              code:"SKT",      arr:"07:28", dep:"07:28", dist:38.0 },
  ],
  "UP-32-AT-4521": [
    { name:"ISBT Delhi",         code:"ISBT-D",  arr:"06:00", dep:"06:00", dist:0 },
    { name:"NH-48 Toll Plaza",   code:"NH48-T",  arr:"06:40", dep:"06:42", dist:28 },
    { name:"Manesar",            code:"MNS",     arr:"07:10", dep:"07:12", dist:52 },
    { name:"Dharuhera",          code:"DHR",     arr:"07:45", dep:"07:47", dist:79 },
    { name:"Rewari",             code:"RWR",     arr:"08:10", dep:"08:12", dist:95 },
    { name:"Alwar",              code:"AWR",     arr:"09:05", dep:"09:08", dist:148 },
    { name:"Sindhi Camp Jaipur", code:"JP-SC",   arr:"10:45", dep:"10:45", dist:268 },
  ],
  "HR-55-PA-2200": [
    { name:"ISBT Delhi",         code:"ISBT-D",  arr:"07:00", dep:"07:00", dist:0 },
    { name:"Mukarba Chowk",      code:"MKC",     arr:"07:20", dep:"07:21", dist:14 },
    { name:"Panipat",            code:"PNP",     arr:"08:30", dep:"08:33", dist:88 },
    { name:"Karnal",             code:"KNL",     arr:"09:00", dep:"09:02", dist:120 },
    { name:"Ambala",             code:"ABL",     arr:"09:50", dep:"09:53", dist:197 },
    { name:"ISBT Sector 43 CHD", code:"CHD-43",  arr:"10:50", dep:"10:50", dist:260 },
  ],
  "DL-BUS-202": [
    { name:"Red Fort",           code:"RDF",     arr:"08:00", dep:"08:00", dist:0 },
    { name:"Chandni Chowk",      code:"CHC",     arr:"08:10", dep:"08:11", dist:1.8 },
    { name:"Connaught Place",    code:"CP",      arr:"08:35", dep:"08:36", dist:7 },
    { name:"RK Puram",           code:"RKP",     arr:"08:55", dep:"08:56", dist:14.5 },
    { name:"Vasant Kunj",        code:"VKJ",     arr:"09:12", dep:"09:13", dist:22 },
    { name:"Dwarka Sector 21",   code:"DWK-21",  arr:"09:45", dep:"09:45", dist:36 },
  ],
};

const BUS_CURRENT_STOP = { "DL-BUS-101":2, "UP-32-AT-4521":3, "HR-55-PA-2200":3, "DL-BUS-202":1 };

const BUS_SEATS = {
  "DL-BUS-101":    { capacity:50, booked:["1A","1B","2A","3B","4A","5B","6A","7B","8A","9B","10A","11B","12A"] },
  "DL-BUS-202":    { capacity:50, booked:["1A","1B","2A","3B","4A","4B","5A","6B","7A","8B"] },
  "UP-32-AT-4521": { capacity:54, booked:["1A","1B","1C","1D","2A","2B","2C","2D","3A","3C","4B","4D","5A","5B","6C","6D","7A","8B","9A","9D","10B","10C"] },
  "HR-55-PA-2200": { capacity:54, booked:["1A","1B","1C","1D","2A","2B","3C","3D","4A","4B","5A","6B","7C","8D","9A","9B","10C","11D"] },
};

const FARE_RATES = {
  local:     { base:10, perKm:1.5, tax:0.05 },
  intercity: { base:50, perKm:0.9, tax:0.05 },
};

const BUS_DATABASE = [
  { id:"DL-BUS-101",    plate:"DL 1PA 4521",   type:"local",     operator:"DTC",    capacity:50, route:"Route 10A" },
  { id:"DL-BUS-202",    plate:"DL 4CB 9900",   type:"local",     operator:"DTC",    capacity:50, route:"Route 22B" },
  { id:"DL-BUS-303",    plate:"DL 7GH 1234",   type:"local",     operator:"DTC",    capacity:45, route:"Route 05C" },
  { id:"UP-32-AT-4521", plate:"UP 32 AT 4521", type:"intercity", operator:"UPSRTC", capacity:54, route:"Delhi → Jaipur Express" },
  { id:"HR-55-PA-2200", plate:"HR 55 PA 2200", type:"intercity", operator:"HRTC",   capacity:54, route:"Delhi → Chandigarh Express" },
  { id:"RJ-09-CA-8800", plate:"RJ 09 CA 8800", type:"intercity", operator:"RSRTC",  capacity:54, route:"Jaipur → Ajmer Volvo" },
];

const EMERGENCY_ALERTS = {};

// Expose globally
window.TracerAPI        = TracerAPI;
window.getSocket        = getSocket;
window.DEMO_BUSES       = DEMO_BUSES;
window.BUS_STOPS        = BUS_STOPS;
window.BUS_CURRENT_STOP = BUS_CURRENT_STOP;
window.BUS_SEATS        = BUS_SEATS;
window.FARE_RATES       = FARE_RATES;
window.BUS_DATABASE     = BUS_DATABASE;
window.EMERGENCY_ALERTS = EMERGENCY_ALERTS;

// Simulate demo movement (used as fallback when no live data)
window.simulateDemoMovement = function(loc, heading) {
  const speed = 0.00008, h = (heading || 180) * Math.PI / 180;
  return {
    ...loc,
    lat: loc.lat + Math.cos(h) * speed * (0.8 + Math.random() * 0.4),
    lng: loc.lng + Math.sin(h) * speed * (0.8 + Math.random() * 0.4),
    speed: Math.max(10, Math.min(120, (loc.speed||50) + (Math.random()-0.5)*8)),
    timestamp: Date.now()
  };
};

window.addPassengerLocation = function(busId, uid, lat, lng, accuracy) {
  const socket = getSocket();
  socket.emit('passenger:location', { bus_id: busId, lat, lng, accuracy });
};
