# WhatsApp Business API — Research & Go/No-Go
**Werner — Mobile & Desktop Dev | 2026-04-07**

---

## TL;DR — Empfehlung: GO (mit Einschraenkungen)

WhatsApp Business API ist machbar, aber teurer und aufwaendiger als Telegram.
Fuer Agent-Notifications an Mayk/Team: **Telegram bleibt primaer**.
WhatsApp fuer **externe Kommunikation** (Kunden, Partner) sinnvoll.

---

## 1. Kosten pro Nachricht

### Meta Cloud API (direkt, hosted by Meta)
| Kategorie | Preis/Nachricht (DE) |
|---|---|
| Marketing | ~0,1131 EUR |
| Utility (Transaktional) | ~0,0600 EUR |
| Authentication (OTP) | ~0,0636 EUR |
| Service (Kunden-initiiert, 24h-Fenster) | KOSTENLOS |

- **Erste 1.000 Service-Conversations/Monat: gratis**
- Abrechnung pro 24h-Conversation-Fenster, nicht pro Message
- Quelle: Meta Pricing Page, Stand Q1 2026

### BSP (Business Solution Provider) z.B. Twilio, MessageBird
| Anbieter | Aufschlag | Monatliche Grundgebuehr |
|---|---|---|
| Twilio | +0,005 USD/Msg | ab 0 USD (Pay-as-you-go) |
| MessageBird | +0,004 EUR/Msg | ab 0 EUR |
| 360dialog | kein Aufschlag | 49 EUR/Monat |

**Empfehlung: Meta Cloud API direkt** — kein BSP-Aufschlag, volle Kontrolle.

---

## 2. Meta Business Verification — Steps

### Voraussetzungen
1. **Meta Business Account** (business.facebook.com)
2. **Verifizierte Business-Domain** (DNS TXT oder Meta-Tag)
3. **Business Verification** (Identitaetsnachweis):
   - Handelsregister-Auszug ODER
   - Gewerbeanmeldung ODER  
   - Umsatzsteuer-Bescheinigung
4. **WhatsApp Business Account** erstellt via Meta Business Suite
5. **Display Name** genehmigt (muss zum verifizierten Business passen)
6. **Telefonnummer** die noch nicht mit WhatsApp verknuepft ist

### Verification-Ablauf
```
Tag 1:  Meta Business Account anlegen + Domain verifizieren
Tag 2:  Business Verification einreichen (Dokumente hochladen)
Tag 3-7: Meta prueft (typisch 2-5 Werktage, manchmal laenger)
Tag 7:  WhatsApp Business Account erstellen
Tag 7:  Telefonnummer registrieren + OTP verifizieren
Tag 7:  Display Name beantragen (1-3 Tage Review)
Tag 10: API Zugang aktiv, erste Test-Messages
```

### Bekannte Stolpersteine
- Business Name muss **exakt** mit Dokumenten uebereinstimmen
- Ablehnung = nochmal von vorn (keine Teilkorrektur moeglich)
- Nur **eine Nummer pro WhatsApp Business Account** am Start (spaeter mehr)
- Nummer darf **nicht** bereits WhatsApp nutzen (neue SIM oder VoIP)

---

## 3. Timeline — Realistisch

| Phase | Dauer | Was |
|---|---|---|
| Account + Verification | 5-10 Werktage | Meta Business, Docs, Review |
| API Setup + Test | 1-2 Tage | Token, Webhook, Test-Messages |
| Template Approval | 1-3 Tage | Nachrichtenvorlagen (HSM) genehmigen |
| Integration in BLUN | 2-3 Tage | Code, PM2, Error Handling |
| **Gesamt** | **~2-3 Wochen** | Bis produktiv |

**Kritischer Pfad: Meta Verification** — darauf haben wir keinen Einfluss.

---

## 4. Technische Integration

### Architektur (wenn GO)
```
BLUN Agent System
    |
    v
Notification Hub (Port 3210)  <-- existiert bereits
    |
    +-- Telegram (fertig)
    +-- WhatsApp (neu)
         |
         v
    Meta Cloud API
    POST graph.facebook.com/v21.0/{phone_id}/messages
```

### Message Templates (Pflicht fuer Business-initiierte Nachrichten)
Muss **vorher** bei Meta genehmigt werden:
```
Name: blun_task_done
Sprache: de
Body: "Agent {{1}} hat Task erledigt: {{2}} — {{3}}"
```

### Code-Aenderung am Webhook
Minimal — neuer Channel neben Telegram:
```javascript
// In notification-webhook.js — _setupEventHandlers erweitern
for (const recipientKey of eventCfg.notify) {
  const recipient = this.config.recipients[recipientKey];
  if (recipient.telegram) await sendTelegram(...);
  if (recipient.whatsapp) await sendWhatsApp(...);
}
```

---

## 5. Go/No-Go Matrix

| Kriterium | Status | Kommentar |
|---|---|---|
| Kosten tragbar? | GO | ~0,06 EUR/Utility-Msg, 1000 Service-Convos gratis |
| Verification machbar? | GO (wenn BLUN GmbH/UG) | Handelsregister noetig |
| Timeline ok? | WARNUNG | 2-3 Wochen bis live |
| Technisch machbar? | GO | REST API, gut dokumentiert |
| Mehrwert vs. Telegram? | BEDINGT | Nur wenn externe Empfaenger (Kunden) |
| Compliance (DSGVO)? | GO | Meta ist Auftragsverarbeiter, AV-Vertrag noetig |

### Empfehlung
- **Fuer interne Agent-Notifications: Telegram reicht** (gratis, sofort, keine Verification)
- **Fuer externe Kommunikation: WhatsApp GO** — Verification jetzt starten, parallel entwickeln
- **Naechster Schritt: Mayk entscheidet** ob externe Komms ueber WhatsApp laufen sollen

---

## 6. Alternativen (falls No-Go)

| Kanal | Kosten | Aufwand | Wann sinnvoll |
|---|---|---|---|
| Telegram | Gratis | Minimal (fertig) | Internes Team |
| E-Mail (SES) | ~0,0001 EUR/Mail | 1-2 Tage | Reports, Logs |
| SMS (Twilio) | ~0,07 EUR/SMS | 1 Tag | Alerts, OTPs |
| Push (FCM/APNs) | Gratis | 3-5 Tage (App noetig) | Wenn BLUN-App kommt |
