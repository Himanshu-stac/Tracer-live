// ================================================================
//  TRACER LIVE — Firebase Configuration + Demo Data
// ================================================================
const firebaseConfig = {
  apiKey: "YOUR_API_KEY", authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID", storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID", appId: "YOUR_APP_ID"
};
const DEMO_MODE = true;
if (!DEMO_MODE) { firebase.initializeApp(firebaseConfig); }
const auth = DEMO_MODE ? null : firebase.auth();
const db = DEMO_MODE ? null : firebase.database();

// ---- Route stop data (WIMT-style) ----
const BUS_STOPS = {
  "DL-BUS-101": [
    { name: "ISBT Kashmiri Gate", code: "ISBT-KG", arr: "06:00", dep: "06:00", dist: 0 },
    { name: "Sadar Bazar", code: "SDB", arr: "06:10", dep: "06:11", dist: 3.2 },
    { name: "Karol Bagh", code: "KBG", arr: "06:22", dep: "06:23", dist: 7.8 },
    { name: "Rajouri Garden", code: "RAJ", arr: "06:35", dep: "06:36", dist: 14.1 },
    { name: "Tilak Nagar", code: "TLK", arr: "06:48", dep: "06:49", dist: 19.5 },
    { name: "Janakpuri", code: "JNK", arr: "07:02", dep: "07:03", dist: 24.8 },
    { name: "Uttam Nagar", code: "UTN", arr: "07:14", dep: "07:15", dist: 30.3 },
    { name: "Saket", code: "SKT", arr: "07:28", dep: "07:28", dist: 38.0 },
  ],
  "UP-32-AT-4521": [
    { name: "ISBT Delhi", code: "ISBT-D", arr: "06:00", dep: "06:00", dist: 0 },
    { name: "NH-48 Toll Plaza", code: "NH48-T", arr: "06:40", dep: "06:42", dist: 28.0 },
    { name: "Manesar", code: "MNS", arr: "07:10", dep: "07:12", dist: 52.0 },
    { name: "Dharuhera", code: "DHR", arr: "07:45", dep: "07:47", dist: 79.0 },
    { name: "Rewari", code: "RWR", arr: "08:10", dep: "08:12", dist: 95.0 },
    { name: "Alwar", code: "AWR", arr: "09:05", dep: "09:08", dist: 148.0 },
    { name: "Shahpura", code: "SHP", arr: "09:55", dep: "09:57", dist: 194.0 },
    { name: "Sindhi Camp Jaipur", code: "JP-SC", arr: "10:45", dep: "10:45", dist: 268.0 },
  ],
  "HR-55-PA-2200": [
    { name: "ISBT Delhi", code: "ISBT-D", arr: "07:00", dep: "07:00", dist: 0 },
    { name: "Mukarba Chowk", code: "MKC", arr: "07:20", dep: "07:21", dist: 14.0 },
    { name: "Kundli", code: "KDL", arr: "07:45", dep: "07:46", dist: 32.0 },
    { name: "Panipat", code: "PNP", arr: "08:30", dep: "08:33", dist: 88.0 },
    { name: "Karnal", code: "KNL", arr: "09:00", dep: "09:02", dist: 120.0 },
    { name: "Ambala", code: "ABL", arr: "09:50", dep: "09:53", dist: 197.0 },
    { name: "Zirakpur", code: "ZRK", arr: "10:30", dep: "10:31", dist: 248.0 },
    { name: "ISBT Sector 43 CHD", code: "CHD-43", arr: "10:50", dep: "10:50", dist: 260.0 },
  ],
  "DL-BUS-202": [
    { name: "Red Fort", code: "RDF", arr: "08:00", dep: "08:00", dist: 0 },
    { name: "Chandni Chowk", code: "CHC", arr: "08:10", dep: "08:11", dist: 1.8 },
    { name: "New Delhi Rly Stn", code: "NDLS", arr: "08:22", dep: "08:23", dist: 4.2 },
    { name: "Connaught Place", code: "CP", arr: "08:35", dep: "08:36", dist: 7.0 },
    { name: "RK Puram", code: "RKP", arr: "08:55", dep: "08:56", dist: 14.5 },
    { name: "Vasant Kunj", code: "VKJ", arr: "09:12", dep: "09:13", dist: 22.0 },
    { name: "Dwarka Sector 10", code: "DWK-10", arr: "09:30", dep: "09:31", dist: 31.0 },
    { name: "Dwarka Sector 21", code: "DWK-21", arr: "09:45", dep: "09:45", dist: 36.0 },
  ],
};

// Current stop index per bus (0-based, bus is between this stop and next)
const BUS_CURRENT_STOP = {
  "DL-BUS-101": 2,
  "UP-32-AT-4521": 3,
  "HR-55-PA-2200": 4,
  "DL-BUS-202": 1,
};

const DEMO_BUSES = {
  "DL-BUS-101": {
    info: { busNumber: "DL-BUS-101", type: "local", route: "Route 10A", from: "ISBT Kashmiri Gate", to: "Saket", operator: "DTC", driverName: "Ramesh Kumar" },
    location: { lat: 28.6677, lng: 77.2227, speed: 34, heading: 180, accuracy: 8, timestamp: Date.now() },
    status: "active", delay: 0
  },
  "UP-32-AT-4521": {
    info: { busNumber: "UP-32-AT-4521", type: "intercity", route: "Delhi → Jaipur Express", from: "ISBT Delhi", to: "Sindhi Camp Jaipur", operator: "RSRTC", driverName: "Suresh Sharma" },
    location: { lat: 27.9, lng: 76.6, speed: 82, heading: 225, accuracy: 12, timestamp: Date.now() },
    status: "active", delay: 7
  },
  "HR-55-PA-2200": {
    info: { busNumber: "HR-55-PA-2200", type: "intercity", route: "Delhi → Chandigarh", from: "ISBT Delhi", to: "ISBT Sec 43 CHD", operator: "HRTC", driverName: "Gurpreet Singh" },
    location: { lat: 29.1, lng: 76.9, speed: 91, heading: 340, accuracy: 5, timestamp: Date.now() },
    status: "active", delay: 0
  },
  "DL-BUS-202": {
    info: { busNumber: "DL-BUS-202", type: "local", route: "Route 22B", from: "Red Fort", to: "Dwarka Sector 21", operator: "DTC", driverName: "Manoj Verma" },
    location: { lat: 28.6553, lng: 77.2401, speed: 18, heading: 270, accuracy: 15, timestamp: Date.now() },
    status: "active", delay: 3
  }
};
