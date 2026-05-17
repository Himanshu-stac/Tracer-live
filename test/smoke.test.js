const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { test } = require('node:test');

const PORT = 3107;
const BASE = `http://127.0.0.1:${PORT}`;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start in time')), 12000);
    child.stdout.on('data', chunk => {
      if (String(chunk).includes('Tracer Live server running')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on('data', chunk => {
      const text = String(chunk);
      if (/EADDRINUSE|SyntaxError/i.test(text)) {
        clearTimeout(timer);
        reject(new Error(text));
      }
    });
    child.on('exit', code => {
      if (code !== null && code !== 0) {
        clearTimeout(timer);
        reject(new Error(`Server exited with code ${code}`));
      }
    });
  });
}

async function json(path, options = {}) {
  const response = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  return { response, body };
}

test('Tracer Live smoke flow', async () => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      SUPABASE_URL: 'https://your-project.supabase.co',
      SUPABASE_SERVICE_KEY: 'your-service-role-key',
      JWT_SECRET: 'test-secret'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForServer(child);

    const index = await fetch(BASE + '/');
    assert.equal(index.status, 200);
    assert.match(await index.text(), /Tracer Live/);

    const buses = await json('/api/buses');
    assert.equal(buses.response.status, 200);
    assert.ok(Array.isArray(buses.body));
    assert.ok(buses.body.length > 0);

    const login = await json('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'demo@driver.com', password: 'password' })
    });
    assert.equal(login.response.status, 200);
    assert.ok(login.body.token);

    const started = await json('/api/driver/start-trip', {
      method: 'POST',
      headers: { Authorization: `Bearer ${login.body.token}` },
      body: JSON.stringify({ bus_id: 'DL-BUS-101', route: 'ISBT Kashmiri Gate -> Saket' })
    });
    assert.equal(started.response.status, 200);
    assert.equal(started.body.ok, true);

    const stops = await json('/api/buses/DL-BUS-101/stops');
    assert.equal(stops.response.status, 200);
    assert.ok(stops.body.length >= 2);

    const passenger = await json('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'demo@passenger.com', password: 'password' })
    });
    assert.equal(passenger.response.status, 200);

    const payment = await json('/api/payment', {
      method: 'POST',
      headers: { Authorization: `Bearer ${passenger.body.token}` },
      body: JSON.stringify({ bus_id: 'DL-BUS-101', from_stop: 'ISBT-KG', to_stop: 'SKT', fare: 67, method: 'upi' })
    });
    assert.equal(payment.response.status, 200);
    assert.equal(payment.body.ok, true);
    assert.ok(payment.body.pnr);
  } finally {
    child.kill();
  }
});
