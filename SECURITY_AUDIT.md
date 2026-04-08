# BLUN API Security Audit Report
## Datum: 2026-04-08 | Author: Fritz (Backend Entwickler)

---

## 🚨 KRITISCHE SICHERHEITSLÜCKEN

### 1. **AUTH-BYPASS - LOCALHOST AUTO-ADMIN** 
**Datei:** `server.js:147-162`
**Problem:** Alle Localhost-Requests werden automatisch als Admin authentifiziert
```javascript
// AKTUELL (UNSICHER):
if (req.ip === '127.0.0.1' || req.ip === '::1') {
    req.user = { id: 1, role: 'admin', email: 'admin@localhost' };
    return next();
}
```
**Impact:** 🔴 KRITISCH - Lokaler RCE = Admin-Zugriff
**Fix:** IP-Whitelist für Development nur, nicht Production

### 2. **FEHLENDE AUTH AUF CORE-APIS**
**Datei:** `src/routes/api.js` (23 Endpunkte)
**Problem:** Alle Agent/Company-Endpunkte ohne explizite Auth-Middleware
```javascript
// BETROFFEN (23 Endpunkte):
GET    /api/companies          → OHNE AUTH
POST   /api/companies          → OHNE AUTH  
GET    /api/agents             → OHNE AUTH
POST   /api/agents             → OHNE AUTH
PATCH  /api/agent/:id          → OHNE AUTH
POST   /api/agent/:id/start    → OHNE AUTH
// ... alle weiteren
```
**Impact:** 🔴 KRITISCH - Vollzugriff auf Agent-Management ohne Authentifizierung
**Fix:** Explizite `requireAuth` Middleware für alle Management-Endpunkte

### 3. **HARDCODED API-KEY**
**Datei:** `server.js` + `.env`
**Problem:** Default API-Key "blun-dev-key" im Code
```javascript
const API_KEY = process.env.BLUN_API_KEY || "blun-dev-key";
```
**Impact:** 🔴 HOCH - Bekannter API-Key ermöglicht Auth-Bypass
**Fix:** Fail-Fast bei fehlendem API_KEY, keine Defaults

---

## ⚠️ HOHE PRIORITÄT

### 4. **COOKIE-SECURITY SCHWACH**
**Datei:** `src/middleware/auth.js:47,77`
**Problem:** `secure: false` für Session-Cookies
```javascript
// UNSICHER:
res.cookie('blun_token', token, {
    httpOnly: true,
    secure: false,  // ← PROBLEM
    sameSite: 'lax'
});
```
**Impact:** 🟡 HOCH - Session-Hijacking über HTTP
**Fix:** `secure: true` für Production, Environment-basiert

### 5. **RATE-LIMITER IN-MEMORY**
**Datei:** `src/middleware/rate-limiter.js`
**Problem:** Map-basierter Store, verliert Daten bei Restart
```javascript
const requestCounts = new Map(); // ← Verliert Daten
```
**Impact:** 🟡 MITTEL - Keine persistente Rate-Limiting
**Fix:** Redis-basierter Store für Cluster-Support

### 6. **FEHLENDE CSRF-PROTECTION**
**Datei:** Alle POST/PUT/DELETE Routen
**Problem:** Keine CSRF-Token Validierung
**Impact:** 🟡 MITTEL - Cross-Site Request Forgery möglich
**Fix:** CSRF-Middleware implementieren

---

## 📊 AUDIT ZUSAMMENFASSUNG

### Endpunkt-Übersicht (221 Handler in 31 Dateien):

| Route-Kategorie | Auth-Status | Rate-Limited | CSRF-Protected |
|----------------|-------------|--------------|----------------|
| `/api/agents/*` | ❌ **FEHLT** | ✅ 120/min | ❌ **FEHLT** |
| `/api/companies/*` | ❌ **FEHLT** | ✅ 120/min | ❌ **FEHLT** |
| `/auth/*` | ✅ Mixed | ✅ 120/min | ❌ **FEHLT** |
| `/billing/*` | ✅ requireAuth | ✅ 120/min | ❌ **FEHLT** |
| `/admin/*` | ✅ requireAdmin | ✅ 30/min | ❌ **FEHLT** |
| `/organisator/*` | ⚠️ Server-Level | ✅ 120/min | ❌ **FEHLT** |

### Security-Middleware-Stack (Server.js):
```
1. ✅ Helmet (Security Headers)
2. ✅ CORS (Whitelist-basiert) 
3. ✅ Input Sanitizer (XSS/Injection-Schutz)
4. ✅ Rate Limiter (3-Tier System)
5. ❌ KEINE CSRF-Protection
6. ⚠️ Auth-Bypass für Localhost
```

---

## 🛠️ PRIORISIERTE FIXES

### PHASE 1 - SOFORT (Kritisch):
1. **Auth-Middleware für /api/* Routen hinzufügen**
2. **Localhost-Auth-Bypass entfernen/beschränken** 
3. **API-Key Hardcoding entfernen**

### PHASE 2 - Diese Woche (Hoch):
4. **Cookie Security verschärfen (secure: true)**
5. **Redis-basiertes Rate-Limiting**
6. **CSRF-Protection implementieren**

### PHASE 3 - Nächste Woche (Mittel):
7. **Session-Management überarbeiten (CSRF-Token)**
8. **Input-Sanitizer optimieren (weniger false-positives)**
9. **Security-Headers erweitern**

---

## 📋 KONKRETE CODE-FIXES

Siehe separates Dokument: `SECURITY_FIXES.md`

---

**Ende des Audit-Reports**
**Nächste Review:** 2026-04-15
**Kontakt:** Fritz (Backend Team)