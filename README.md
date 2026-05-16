# IP Checker

Сайт для проверки — является ли IP адрес **белым** (публичным) или **серым** (CGNAT).

## Как это работает

Российские мобильные операторы (МТС, Мегафон, Билайн, Теле2) в большинстве случаев выдают абонентам **серые IP** через технологию CGNAT (Carrier-Grade NAT) — адреса из диапазона `100.64.0.0/10` (RFC 6598). Это значит, что IP адрес **не уникален**, он используется сотнями абонентов одновременно, и на него нельзя принимать входящие соединения.

Если сайт открылся с мобильной сети и показал **белый IP** — значит оператор выдал вам публичный адрес.

### Проверяемые диапазоны "серых" адресов
- `10.0.0.0/8` — RFC 1918
- `172.16.0.0/12` — RFC 1918  
- `192.168.0.0/16` — RFC 1918
- `100.64.0.0/10` — **RFC 6598 (CGNAT)** — используется операторами
- `127.0.0.0/8` — Loopback
- `169.254.0.0/16` — Link-local

## Деплой на VPS

### Требования
- Node.js 18+
- openssl (обычно уже есть)

### Шаги

```bash
# 1. Клонировать репозиторий
git clone <ваш-репо> ip-checker
cd ip-checker

# 2. Установить зависимости
npm install

# 3. Запустить (SSL сертификат создастся автоматически)
node server.js
```

Сайт поднимется на `https://0.0.0.0:8433`

### Открыть порт в файрволе (если нужно)

```bash
# Ubuntu/Debian с ufw
sudo ufw allow 8433/tcp

# CentOS/Rocky с firewalld
sudo firewall-cmd --add-port=8433/tcp --permanent
sudo firewall-cmd --reload

# Прямо через iptables
sudo iptables -A INPUT -p tcp --dport 8433 -j ACCEPT
```

### Запустить как сервис (systemd)

```bash
sudo nano /etc/systemd/system/ip-checker.service
```

```ini
[Unit]
Description=IP Checker
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/ip-checker
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ip-checker
```

## Доступ

URL: `https://<IP_ВПС>:8433`

> Браузер покажет предупреждение о самоподписанном сертификате — это нормально, нажмите "Всё равно перейти".

**Логин по умолчанию:** `admin` / `admin123`

Сменить в `server.js`:
```js
const USERS = {
  'admin': 'ваш_пароль'
};
```
