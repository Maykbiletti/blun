# Test-Plan: Social Features
**Erstellt:** 2026-04-08 — Sandra (QA)
**Status:** DRAFT — Review durch Team vor Implementierung
**Scope:** Marketplace, Feed, Exchange

---

## 1. MARKETPLACE

### 1.1 Publish (Agent im Marketplace veröffentlichen)

| ID | Typ | Test | Erwartung |
|----|-----|------|-----------|
| MKT-PUB-01 | API | `POST /api/marketplace/publish` mit gültigem Agent-Manifest | 201, Agent erscheint in Marketplace |
| MKT-PUB-02 | API | Publish ohne `name` Feld | 400, Validation Error |
| MKT-PUB-03 | API | Publish ohne Auth-Token | 401 |
| MKT-PUB-04 | API | Publish mit doppeltem Namen (gleicher Owner) | 409 Conflict |
| MKT-PUB-05 | API | Publish mit `visibility: private` | 201, Agent nicht in Public Search sichtbar |
| MKT-PUB-06 | E2E | Publish-Flow über UI: Formular ausfüllen → Submit → Bestätigung | Agent in "Meine Agents" sichtbar |
| MKT-PUB-07 | E2E | Pflichtfelder leer lassen → Submit | Inline-Validation, kein Submit |

### 1.2 Install (Clone prüfen!)

| ID | Typ | Test | Erwartung |
|----|-----|------|-----------|
| MKT-INS-01 | API | `POST /api/marketplace/install/{agentId}` | 200, Agent in User-Liste |
| MKT-INS-02 | API | Install erstellt echten Clone (nicht Referenz) | Installierter Agent hat eigene ID, eigene Config |
| MKT-INS-03 | API | Original-Agent ändern → installierte Kopie bleibt unverändert | GET installierter Agent → alte Werte |
| MKT-INS-04 | API | Installierten Agent ändern → Original bleibt unverändert | GET Original → alte Werte |
| MKT-INS-05 | API | Install eines bereits installierten Agents | 409 oder Versions-Update (je nach Spec) |
| MKT-INS-06 | API | Install eines private Agents (anderer Owner) | 403 |
| MKT-INS-07 | E2E | Install-Button klicken → Agent erscheint in Sidebar | Clone in eigener Liste sichtbar |
| MKT-INS-08 | E2E | Nach Install: Agent starten und nutzen | Agent antwortet, eigene Conversation |

### 1.3 Review CRUD

| ID | Typ | Test | Erwartung |
|----|-----|------|-----------|
| MKT-REV-01 | API | `POST /api/marketplace/{agentId}/reviews` mit Rating 1-5 + Text | 201 |
| MKT-REV-02 | API | Review ohne Rating | 400 |
| MKT-REV-03 | API | Rating außerhalb 1-5 (0, 6, -1) | 400 |
| MKT-REV-04 | API | Zweite Review vom selben User | 409 oder Update (je nach Spec) |
| MKT-REV-05 | API | `GET /api/marketplace/{agentId}/reviews` | 200, Array mit Reviews |
| MKT-REV-06 | API | `PUT /api/marketplace/{agentId}/reviews/{reviewId}` eigene Review | 200, geändert |
| MKT-REV-07 | API | PUT fremde Review | 403 |
| MKT-REV-08 | API | `DELETE /api/marketplace/{agentId}/reviews/{reviewId}` eigene | 204 |
| MKT-REV-09 | API | DELETE fremde Review | 403 |
| MKT-REV-10 | API | Durchschnitts-Rating nach CRUD korrekt | GET Agent → `averageRating` stimmt |
| MKT-REV-11 | E2E | Review schreiben über UI | Sterne + Text → Submit → Review sichtbar |
| MKT-REV-12 | E2E | Eigene Review bearbeiten/löschen | Buttons nur bei eigener Review sichtbar |

### 1.4 Search + Filter

| ID | Typ | Test | Erwartung |
|----|-----|------|-----------|
| MKT-SRC-01 | API | `GET /api/marketplace?q=keyword` | Ergebnisse enthalten Keyword in Name/Beschreibung |
| MKT-SRC-02 | API | `GET /api/marketplace?category=automation` | Nur Agents dieser Kategorie |
| MKT-SRC-03 | API | `GET /api/marketplace?sort=rating` | Absteigend nach Rating sortiert |
| MKT-SRC-04 | API | `GET /api/marketplace?sort=installs` | Absteigend nach Install-Count |
| MKT-SRC-05 | API | `GET /api/marketplace?sort=newest` | Neueste zuerst |
| MKT-SRC-06 | API | Kombination: `?q=test&category=qa&sort=rating` | Filter kombiniert korrekt |
| MKT-SRC-07 | API | Leere Suche → alle Public Agents | 200, Array |
| MKT-SRC-08 | API | Suche ohne Treffer | 200, leeres Array (nicht 404) |
| MKT-SRC-09 | E2E | Suchfeld + Filter-Dropdown → Ergebnisse live | UI aktualisiert sich |
| MKT-SRC-10 | E2E | Pagination bei >20 Ergebnissen | Nächste Seite lädt weitere |

---

## 2. FEED

### 2.1 Auto-Post bei Task-Done

| ID | Typ | Test | Erwartung |
|----|-----|------|-----------|
| FED-AUT-01 | API | Task abschließen → Feed-Eintrag automatisch erstellt | GET /api/feed → neuer Post mit Task-Referenz |
| FED-AUT-02 | API | Auto-Post enthält: Agent-Name, Task-Titel, Timestamp | Alle Felder vorhanden |
| FED-AUT-03 | API | Private Tasks erzeugen keinen Public Feed-Post | GET /api/feed (anderer User) → Post nicht sichtbar |
| FED-AUT-04 | API | Mehrere Tasks schnell hintereinander → je ein Post (kein Batching) | Count stimmt |
| FED-AUT-05 | E2E | Task abschließen → Feed-Seite öffnen → Post sichtbar | Post mit Inhalt da |

### 2.2 Like / Comment

| ID | Typ | Test | Erwartung |
|----|-----|------|-----------|
| FED-LIK-01 | API | `POST /api/feed/{postId}/like` | 200, likeCount +1 |
| FED-LIK-02 | API | Doppel-Like (Toggle) | 200, likeCount -1 (Unlike) |
| FED-LIK-03 | API | Like ohne Auth | 401 |
| FED-COM-01 | API | `POST /api/feed/{postId}/comments` mit Text | 201 |
| FED-COM-02 | API | Comment ohne Text | 400 |
| FED-COM-03 | API | `GET /api/feed/{postId}/comments` | 200, Array sortiert nach Datum |
| FED-COM-04 | API | `DELETE /api/feed/{postId}/comments/{id}` eigener | 204 |
| FED-COM-05 | API | DELETE fremder Comment | 403 |
| FED-COM-06 | E2E | Like-Button klicken → Count animiert hoch | Visuelles Feedback |
| FED-COM-07 | E2E | Comment schreiben → erscheint ohne Reload | Live-Update |

### 2.3 Pagination

| ID | Typ | Test | Erwartung |
|----|-----|------|-----------|
| FED-PAG-01 | API | `GET /api/feed?page=1&limit=20` | Max 20 Posts, `hasMore` Flag |
| FED-PAG-02 | API | `GET /api/feed?page=2` | Nächste 20, keine Duplikate zu Page 1 |
| FED-PAG-03 | API | Page über Maximum hinaus | 200, leeres Array |
| FED-PAG-04 | API | `limit=0` oder `limit=-1` | 400 oder Default-Limit |
| FED-PAG-05 | E2E | Infinite Scroll → nächste Posts laden | Neue Posts erscheinen beim Scrollen |

### 2.4 Trending-Algorithmus

| ID | Typ | Test | Erwartung |
|----|-----|------|-----------|
| FED-TRD-01 | API | `GET /api/feed?sort=trending` | Posts mit vielen Likes+Comments kürzlich oben |
| FED-TRD-02 | API | Alter Post mit vielen Likes < neuer Post mit weniger Likes | Time-Decay greift |
| FED-TRD-03 | API | Post ohne Interaktion rutscht ab | Position sinkt über Zeit |
| FED-TRD-04 | API | Trending-Score konsistent bei mehreren Requests | Gleiche Reihenfolge |
| FED-TRD-05 | E2E | "Trending" Tab zeigt andere Reihenfolge als "Neueste" | Sortierung unterschiedlich |

---

## 3. EXCHANGE (Agent-Austausch)

### 3.1 Offer → Request → Accept → Session → Revoke Flow

| ID | Typ | Test | Erwartung |
|----|-----|------|-----------|
| EXC-FLW-01 | API | `POST /api/exchange/offer` — Agent zum Tausch anbieten | 201, Offer mit Status `open` |
| EXC-FLW-02 | API | `POST /api/exchange/request/{offerId}` — Tausch anfragen | 201, Request mit Status `pending` |
| EXC-FLW-03 | API | `POST /api/exchange/accept/{requestId}` — Owner akzeptiert | 200, Session erstellt, Status `active` |
| EXC-FLW-04 | API | Session: Requester kann Agent nutzen | `POST /api/exchange/session/{id}/chat` → 200 |
| EXC-FLW-05 | API | `POST /api/exchange/revoke/{sessionId}` — Owner widerruft | 200, Session Status `revoked` |
| EXC-FLW-06 | API | Nach Revoke: Chat-Versuch → 403 | Zugriff sofort gesperrt |
| EXC-FLW-07 | API | Request auf eigenen Agent | 400 (kein Self-Exchange) |
| EXC-FLW-08 | API | Request auf geschlossenes Offer | 410 Gone |
| EXC-FLW-09 | API | Accept durch Nicht-Owner | 403 |
| EXC-FLW-10 | E2E | Kompletter Flow in UI: Offer → Request → Accept → Chat → Revoke | Alle Status-Wechsel sichtbar |

### 3.2 Permission-Enforcement

| ID | Typ | Test | Erwartung |
|----|-----|------|-----------|
| EXC-PRM-01 | API | Read-Only Agent: `GET /api/exchange/session/{id}/data` | 200 |
| EXC-PRM-02 | API | Read-Only Agent: `POST /api/exchange/session/{id}/write` | **403 — KRITISCH** |
| EXC-PRM-03 | API | Read-Only Agent: `DELETE /api/exchange/session/{id}/data/{x}` | **403 — KRITISCH** |
| EXC-PRM-04 | API | Read-Only Agent: `PUT /api/exchange/session/{id}/config` | **403 — KRITISCH** |
| EXC-PRM-05 | API | Full-Access Agent: alle Operationen erlaubt | 200 für GET/POST/PUT/DELETE |
| EXC-PRM-06 | API | Permission-Wechsel während aktiver Session | Sofort wirksam oder nach Re-Auth |
| EXC-PRM-07 | API | Versuch, Permission-Level zu eskalieren (Requester) | **403 — KRITISCH** |
| EXC-PRM-08 | E2E | Read-Only Badge in UI sichtbar | Visueller Indikator |
| EXC-PRM-09 | E2E | Write-Button disabled bei Read-Only Session | Button ausgegraut, Tooltip erklärt |

### 3.3 Timeout / Auto-Revoke

| ID | Typ | Test | Erwartung |
|----|-----|------|-----------|
| EXC-TMO-01 | API | Session mit TTL erstellen (z.B. 30 Min) | Session hat `expiresAt` Feld |
| EXC-TMO-02 | API | Nach Ablauf: Chat-Versuch → 403 | Auto-Revoke greift |
| EXC-TMO-03 | API | Session-Status nach Ablauf = `expired` | Nicht `active` |
| EXC-TMO-04 | API | Verlängerung vor Ablauf durch Owner | `expiresAt` verschoben |
| EXC-TMO-05 | API | Verlängerung durch Requester (nicht Owner) | 403 |
| EXC-TMO-06 | API | Session ohne TTL (unbegrenzt) → nur manuelles Revoke | Kein Auto-Expire |
| EXC-TMO-07 | API | Cleanup-Job: abgelaufene Sessions werden bereinigt | DB-Check: keine aktiven Sessions nach Ablauf |
| EXC-TMO-08 | E2E | Countdown-Anzeige bei TTL-Session | Timer sichtbar, Warnung bei < 5 Min |
| EXC-TMO-09 | E2E | Session läuft ab während User aktiv → Hinweis | Modal/Toast: "Session abgelaufen" |

---

## Test-Infrastruktur

### Benötigte API-Routen

```
# Marketplace
POST   /api/marketplace/publish
POST   /api/marketplace/install/{agentId}
GET    /api/marketplace
GET    /api/marketplace/{agentId}
POST   /api/marketplace/{agentId}/reviews
GET    /api/marketplace/{agentId}/reviews
PUT    /api/marketplace/{agentId}/reviews/{reviewId}
DELETE /api/marketplace/{agentId}/reviews/{reviewId}

# Feed
GET    /api/feed
POST   /api/feed/{postId}/like
POST   /api/feed/{postId}/comments
GET    /api/feed/{postId}/comments
DELETE /api/feed/{postId}/comments/{commentId}

# Exchange
POST   /api/exchange/offer
POST   /api/exchange/request/{offerId}
POST   /api/exchange/accept/{requestId}
POST   /api/exchange/revoke/{sessionId}
POST   /api/exchange/session/{id}/chat
GET    /api/exchange/session/{id}/data
POST   /api/exchange/session/{id}/write
PUT    /api/exchange/session/{id}/config
DELETE /api/exchange/session/{id}/data/{dataId}
```

### data-testid Attribute (Frontend)

```
# Marketplace
marketplace-search, marketplace-filter-category, marketplace-filter-sort
marketplace-agent-card, marketplace-publish-form, marketplace-publish-submit
marketplace-install-btn, marketplace-review-form, marketplace-review-stars
marketplace-review-submit, marketplace-review-edit, marketplace-review-delete
marketplace-pagination

# Feed
feed-post, feed-like-btn, feed-like-count
feed-comment-input, feed-comment-submit, feed-comment-item
feed-comment-delete, feed-tab-trending, feed-tab-newest
feed-infinite-scroll-trigger

# Exchange
exchange-offer-btn, exchange-request-btn, exchange-accept-btn
exchange-revoke-btn, exchange-session-chat, exchange-session-timer
exchange-permission-badge, exchange-status-indicator
exchange-write-btn (disabled bei read-only)
```

### Test-Fixtures (Seed-Daten)

```typescript
// tests/fixtures/social.ts
export const testAgent = {
  name: 'Test-Agent-QA',
  description: 'QA Test Agent für Marketplace',
  category: 'automation',
  visibility: 'public',
  skills: ['search', 'summarize']
};

export const testReview = {
  rating: 4,
  text: 'Solider Agent, macht was er soll.'
};

export const testOffer = {
  agentId: '', // wird dynamisch gesetzt
  permissions: 'read-only',
  ttl: 1800 // 30 Min
};
```

---

## Zusammenfassung

| Feature | API Tests | E2E Tests | Gesamt | Kritisch |
|---------|-----------|-----------|--------|----------|
| Marketplace Publish | 5 | 2 | 7 | — |
| Marketplace Install | 6 | 2 | 8 | MKT-INS-02/03/04 (Clone!) |
| Marketplace Reviews | 10 | 2 | 12 | — |
| Marketplace Search | 8 | 2 | 10 | — |
| Feed Auto-Post | 4 | 1 | 5 | FED-AUT-03 (Privacy) |
| Feed Like/Comment | 7 | 2 | 9 | — |
| Feed Pagination | 4 | 1 | 5 | — |
| Feed Trending | 4 | 1 | 5 | — |
| Exchange Flow | 9 | 1 | 10 | EXC-FLW-06 (Revoke) |
| Exchange Permissions | 7 | 2 | 9 | EXC-PRM-02/03/04/07 |
| Exchange Timeout | 7 | 2 | 9 | EXC-TMO-02 (Auto-Revoke) |
| **GESAMT** | **71** | **18** | **89** | **11** |

---

## Prioritäten

**P0 — Security-kritisch (vor Release):**
- EXC-PRM-02/03/04: Read-Only darf NICHT schreiben
- EXC-PRM-07: Permission-Eskalation blockiert
- EXC-FLW-06: Revoke sperrt sofort
- EXC-TMO-02: Auto-Revoke greift

**P1 — Daten-Integrität:**
- MKT-INS-02/03/04: Clone-Isolation (kein Shared State!)
- FED-AUT-03: Private Tasks nicht im Public Feed

**P2 — Funktional:**
- Alle CRUD-Tests, Pagination, Search/Filter

**P3 — UX:**
- Alle E2E-Tests (UI-Verhalten)

---

## Nächste Schritte

1. **Review durch Team** — Dieter/Greta: Fehlen Routes? Stimmen die Endpoints?
2. **Fixtures + Seed-Script** schreiben
3. **API-Tests** implementieren (P0 zuerst)
4. **E2E-Tests** implementieren
5. **CI-Integration** — Tests in Pipeline einbauen
