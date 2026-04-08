# Affiliate-System — Mobile Design-Draft

**Autor:** Rolf (Business Dev)
**Datum:** 2026-04-07
**Status:** Design-Draft
**Tier:** Pro+

---

## 1. Affiliate-Modell Uebersicht

### Revenue Share

| Affiliate-Stufe | Provision | Bedingung |
|---|---|---|
| **Starter** | 15% recurring | 0–10 geworbene Kunden |
| **Partner** | 20% recurring | 11–50 Kunden |
| **Elite** | 25% recurring | 51+ Kunden ODER 5.000€/Monat Umsatz |

- Recurring = Provision solange geworbener Kunde zahlt
- Cookie-Laufzeit: 90 Tage
- Auszahlung: Monatlich, ab 50€ Minimum
- Auszahlungsmethoden: PayPal, Bankueberweisung, Stripe Connect

### Zwei-Stufen-Affiliate (Sub-Affiliates)

| Stufe | Provision |
|---|---|
| Direkt geworben | Volle Provision (15/20/25%) |
| Sub-Affiliate Ebene 1 | 5% auf deren Umsatz |

## 2. Mobile Dashboard — Wireframe

```
+------------------------------------------+
|  BLUN Affiliate Dashboard         [=]    |
+------------------------------------------+
|                                          |
|  Dein Verdienst                          |
|  +------------------------------------+  |
|  |  Diesen Monat        Gesamt        |  |
|  |  €847,20            €12.340,00     |  |
|  +------------------------------------+  |
|                                          |
|  +------------------------------------+  |
|  |  [################____] 38/50      |  |
|  |  Noch 12 Kunden bis Partner-Stufe  |  |
|  +------------------------------------+  |
|                                          |
|  Quick Actions                           |
|  +----------+  +----------+              |
|  | Link     |  | QR-Code  |              |
|  | kopieren |  | teilen   |              |
|  +----------+  +----------+              |
|  +----------+  +----------+              |
|  | Dashboard|  | Auszahl. |              |
|  | Details  |  | anfordern|              |
|  +----------+  +----------+              |
|                                          |
|  Letzte Aktivitaet                       |
|  +------------------------------------+  |
|  | Heute   Max K. — Pro Plan  +€8,70  |  |
|  | Gestern Anna L. — Free     —      |  |
|  | 04.04   Firma X — Enterprise       |  |
|  |                     +€249,00       |  |
|  +------------------------------------+  |
|                                          |
|  [Home] [Stats] [Links] [Profil]         |
+------------------------------------------+
```

## 3. Mobile-spezifische Features

### Link-Sharing
- **1-Tap Copy:** Affiliate-Link in Zwischenablage
- **Native Share API:** `navigator.share()` fuer WhatsApp, Telegram, E-Mail
- **QR-Code Generator:** Dynamisch, mit BLUN-Logo in der Mitte, speicherbar als PNG
- **Deep Links:** Affiliate-Parameter bleiben bei App-Install erhalten

### Push-Benachrichtigungen
| Event | Notification |
|---|---|
| Neuer Kunde registriert | "Max K. hat sich ueber deinen Link angemeldet!" |
| Kunde upgraded | "Anna L. ist auf Pro gewechselt — +€8,70/Monat fuer dich!" |
| Auszahlung verarbeitet | "€847,20 wurde ueberwiesen" |
| Stufen-Aufstieg | "Glueckwunsch! Du bist jetzt Partner-Affiliate!" |

### Statistiken (Mobile-optimiert)
- Swipe zwischen Zeitraeumen (Woche/Monat/Jahr)
- Tap auf Balken zeigt Tages-Detail
- Sparkline-Charts (keine schweren Chart-Libraries)
- Offline-faehig: Letzte Daten aus IndexedDB

## 4. Tracking & Attribution

| Methode | Details |
|---|---|
| URL-Parameter | `?ref=AFFILIATE_CODE` |
| First-Party Cookie | 90 Tage, SameSite=Lax |
| Server-side Tracking | Fallback wenn Cookies geblockt |
| Fingerprint | NICHT verwendet (DSGVO) |

**DSGVO-Konformitaet:**
- Affiliate-Tracking nur nach Cookie-Consent
- Keine personenbezogenen Daten im Affiliate-Cookie
- Datenverarbeitungsvertrag mit Affiliates
- Opt-out jederzeit moeglich

## 5. Technische Integration

```
User klickt Affiliate-Link
    → Landing Page mit ?ref=CODE
    → Cookie gesetzt (nach Consent)
    → User registriert sich
    → Backend: Affiliate-Zuordnung in DB
    → User kauft Plan
    → Webhook → Affiliate-Service
    → Provision berechnet + Dashboard aktualisiert
    → Push-Notification an Affiliate
```

### API-Endpoints (geplant)

| Endpoint | Methode | Beschreibung |
|---|---|---|
| `/api/affiliate/stats` | GET | Dashboard-Daten |
| `/api/affiliate/links` | GET/POST | Links verwalten |
| `/api/affiliate/payouts` | GET | Auszahlungshistorie |
| `/api/affiliate/payout-request` | POST | Auszahlung anfordern |
| `/api/affiliate/qr/:code` | GET | QR-Code generieren |

## 6. Business-Kennzahlen (Ziele)

| KPI | Ziel (6 Monate) |
|---|---|
| Aktive Affiliates | 200+ |
| Affiliate-getriebener Umsatz | 20% vom Gesamtumsatz |
| Durchschnittliche Provision | €120/Monat/Affiliate |
| Conversion Affiliate-Link → Signup | > 8% |
| Signup → Paid | > 15% |

## 7. Offene Entscheidungen

- [ ] Marketplace-Agents: Erhalten Agent-Ersteller auch Affiliate-Provision?
- [ ] White-Label: Koennen Enterprise-Kunden eigenes Affiliate-Branding nutzen?
- [ ] Reseller vs. Affiliate: Separate Programme oder kombiniert?
- [ ] Mindest-Aktivitaet: Affiliate-Status verlieren nach X Monaten ohne Neukunde?
