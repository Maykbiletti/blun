# BLUN Telegram Bot — Deploy-Anleitung für Dieter

## 1. Dateien kopieren
```bash
mkdir -p /root/blun/comms /root/blun/logs
cp telegram-bot.js ecosystem.config.js package.json /root/blun/comms/
```

## 2. Dependencies installieren
```bash
cd /root/blun/comms
npm install
```

## 3. Telegram Bot Token setzen
```bash
# Option A: In ecosystem.config.js direkt eintragen
# Option B: Export (bevorzugt)
export TELEGRAM_BOT_TOKEN="<TOKEN_VON_BOTFATHER>"
```

Bot Token bekommst du bei @BotFather in Telegram:
1. `/newbot` → Name: `BLUN Agent Bot`
2. Token kopieren

## 4. PM2 starten
```bash
cd /root/blun/comms
pm2 start ecosystem.config.js
pm2 save
```

## 5. Prüfen
```bash
pm2 status blun-telegram
pm2 logs blun-telegram --lines 20
```

Dann in Telegram `/status` oder `/tasks` testen.
