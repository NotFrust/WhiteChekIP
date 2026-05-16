const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const PORT = 8433;

// Login credentials (change these!)
const USERS = {
  'admin': 'admin123'
};

// Sessions (in-memory, простая реализация)
const sessions = new Map();

function generateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Диапазоны "серых" (частных/NAT) IP адресов
// В России операторы мобильной связи (МТС, Мегафон, Билайн, Теле2)
// раздают абонентам серые IP из приватных диапазонов через CGNAT
const PRIVATE_RANGES = [
  // RFC 1918 - частные диапазоны
  { start: '10.0.0.0',       end: '10.255.255.255'   },
  { start: '172.16.0.0',     end: '172.31.255.255'   },
  { start: '192.168.0.0',    end: '192.168.255.255'  },
  // RFC 6598 - CGNAT диапазон (100.64.0.0/10)
  // Именно его используют российские операторы для "серых" IP
  { start: '100.64.0.0',     end: '100.127.255.255'  },
  // Loopback
  { start: '127.0.0.0',      end: '127.255.255.255'  },
  // Link-local
  { start: '169.254.0.0',    end: '169.254.255.255'  },
];

function ipToLong(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isPrivateIP(ip) {
  // IPv6 (кроме ::1 и ::ffff:...)
  if (ip.includes(':')) {
    if (ip === '::1') return true;
    // IPv4-mapped IPv6
    const v4match = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/i);
    if (v4match) return isPrivateIP(v4match[1]);
    return false; // публичный IPv6 = белый
  }

  const ipLong = ipToLong(ip);
  for (const range of PRIVATE_RANGES) {
    if (ipLong >= ipToLong(range.start) && ipLong <= ipToLong(range.end)) {
      return true;
    }
  }
  return false;
}

function getClientIP(req) {
  // Цепочка заголовков для определения реального IP
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',').map(ip => ip.trim());
    return ips[0]; // первый - реальный клиент
  }
  return req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth middleware
function requireAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '') ||
                req.query.token;
  if (token && sessions.has(token)) {
    req.user = sessions.get(token);
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// Routes
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (USERS[username] && USERS[username] === password) {
    const token = generateToken();
    sessions.set(token, { username, loginTime: new Date() });
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: 'Неверный логин или пароль' });
  }
});

app.post('/api/logout', requireAuth, (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  sessions.delete(token);
  res.json({ success: true });
});

app.get('/api/check-ip', requireAuth, (req, res) => {
  const ip = getClientIP(req);
  const isGray = isPrivateIP(ip);

  res.json({
    ip: ip,
    isWhite: !isGray,
    status: isGray ? 'gray' : 'white',
    statusText: isGray
      ? 'Серый IP (CGNAT / приватная сеть)'
      : 'Белый IP (публичный, статический или динамический)',
    explanation: isGray
      ? 'Ваш оператор использует CGNAT (Carrier-Grade NAT). IP адрес не является уникальным — он используется множеством абонентов одновременно. Входящие соединения извне невозможны.'
      : 'Ваш IP адрес является публичным. Он виден в интернете и уникален в данный момент. Возможен приём входящих соединений (если нет файрвола).',
    checkedAt: new Date().toISOString(),
    ranges_info: 'Проверяется на вхождение в RFC1918 (10.x, 172.16-31.x, 192.168.x) и RFC6598 (100.64.0.0/10 — CGNAT)'
  });
});

// Serve HTML
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Generate self-signed cert if not exists
if (!fs.existsSync('./cert.pem') || !fs.existsSync('./key.pem')) {
  console.log('Generating self-signed SSL certificate...');
  try {
    execSync(
      'openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 3650 -nodes ' +
      '-subj "/C=RU/ST=Moscow/L=Moscow/O=IPChecker/CN=localhost"',
      { stdio: 'inherit' }
    );
    console.log('Certificate generated.');
  } catch (e) {
    console.error('Failed to generate cert. Run: openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 3650 -nodes -subj "/C=RU/O=IPChecker/CN=localhost"');
    process.exit(1);
  }
}

const httpsOptions = {
  key: fs.readFileSync('./key.pem'),
  cert: fs.readFileSync('./cert.pem')
};

https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at https://0.0.0.0:${PORT}`);
  console.log(`   Access: https://<YOUR_VPS_IP>:${PORT}`);
  console.log(`   Login: admin / admin123`);
});
