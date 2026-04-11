# Pull Request Review Guide

## Ziel
Dieser Guide definiert einen einheitlichen Review-Standard fuer BLUN Pull Requests. Jeder Review muss nachvollziehbar, technisch korrekt und risikoorientiert sein.

## Checkliste pro PR

### 1. Security
- Keine Secrets, Tokens, API-Keys oder Zugangsdaten im Code, in Konfigs oder Testdaten.
- Eingaben werden validiert und serverseitig geprueft.
- Kein Vertrauen in Client-Daten fuer Berechtigungsentscheidungen.
- Authentifizierung und Autorisierung sind konsistent umgesetzt.
- SQL/NoSQL/Command/Template Injection-Risiken sind abgesichert.
- Fehlerausgaben enthalten keine sensiblen internen Details.
- Externe Abhaengigkeiten sind notwendig, aktuell und ohne bekannte kritische CVEs.
- Logging enthaelt keine personenbezogenen oder vertraulichen Daten ohne Notwendigkeit.

### 2. Performance
- Keine offensichtlichen N+1-Abfragen oder unnoetigen Schleifen ueber grosse Datenmengen.
- Datenbankzugriffe nutzen passende Indizes und sinnvolle Query-Patterns.
- Kein unnötiges Laden kompletter Datensaetze (Pagination/Limit einsetzen).
- Netzwerk-Calls sind minimiert, ggf. gebuendelt oder gecacht.
- Rechenintensive Operationen sind begrenzt oder asynchron entkoppelt.
- Frontend rendert effizient (keine unnötigen Re-Renders, keine blockierenden Effekte).
- Payloads bleiben klein (nur benoetigte Felder, Kompression falls relevant).

### 3. Naming & Lesbarkeit
- Bezeichner sind praezise und domainnah (keine kryptischen Abkuerzungen).
- Klassen/Funktionen/Module haben klare Verantwortung.
- Keine irrefuehrenden Namen (Name passt exakt zum Verhalten).
- Konsistente Benennung entsprechend bestehender Projektkonvention.
- Oeffentliche APIs sind selbsterklaerend und stabil benannt.
- Kommentare erklaeren nur komplexe Logik, nicht offensichtlichen Code.

### 4. Tests
- Neue oder geaenderte Logik ist durch Tests abgedeckt.
- Tests pruefen Verhalten, nicht Implementierungsdetails.
- Positive und negative Faelle sind enthalten.
- Edge-Cases und Fehlerpfade sind beruecksichtigt.
- Flaky-Tests, Sleeps und zufallsabhaengige Assertions vermeiden.
- Bestehende Tests laufen weiterhin gruen.
- Bei Bugfixes existiert ein Regressionstest.

### 5. Git Commit Message Format
Commit Messages muessen konsistent und maschinenlesbar sein:

```text
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

Erlaubte `type`-Werte:
- `feat` fuer neue Funktionalitaet
- `fix` fuer Fehlerbehebungen
- `refactor` fuer interne Umstrukturierungen ohne Funktionsaenderung
- `perf` fuer Performance-Verbesserungen
- `test` fuer Testaenderungen
- `docs` fuer Dokumentation
- `build` fuer Build- oder Dependency-Aenderungen
- `ci` fuer CI/CD-Aenderungen
- `chore` fuer sonstige Wartung

Regeln:
- `subject` im Imperativ, kurz und praezise.
- Kein Punkt am Ende der Subject-Zeile.
- Maximal 72 Zeichen fuer Subject.
- Body erklaert *warum* die Aenderung noetig ist, nicht nur *was* geaendert wurde.
- Breaking Changes im Footer kennzeichnen:

```text
BREAKING CHANGE: <beschreibung>
```

Beispiele:
```text
feat(auth): add token refresh endpoint
fix(api): handle null user profile response
test(payments): add regression test for timeout retry
docs(review): define mandatory security checklist
```

## Review-Entscheidung
Ein PR wird nur freigegeben, wenn:
- keine offenen Security-Risiken vorhanden sind,
- keine offensichtlichen Performance-Regressionen erkennbar sind,
- Naming und Struktur konsistent sind,
- erforderliche Tests vorhanden und grün sind,
- Commit-Historie dem Format entspricht.

## Ablehnungsgruende (Request Changes)
- Sicherheitsluecken oder fehlende Validierung.
- Fehlende Tests bei geaenderter Kernlogik.
- Unklare oder irrefuehrende Namen in zentralen Komponenten.
- Performance-Probleme mit absehbarer Produktionswirkung.
- Unscharfe oder inkonsistente Commit Messages.

## Minimaler Review-Kommentarstandard
Jeder Review-Kommentar enthaelt:
- **Befund**: Was ist konkret falsch/risikoreich?
- **Auswirkung**: Welcher Schaden/Fehler kann entstehen?
- **Erwartete Aenderung**: Was muss angepasst werden?

Kurz, praezise, technisch belastbar.
