# BLUN UI Consistency Starter Pack

Dieses Paket erzwingt Grundkonsistenz für Navigation und Layout.

## Dateien

- `src/config/navigation.config.ts`
- `src/lib/design-tokens.ts`
- `src/components/layout/AppShell.tsx`
- `scripts/check-ui-consistency.mjs`

## Nutzung

### 1. Navigation zentralisieren
Alle Menüs nur noch aus `BLUN_NAVIGATION` rendern.

### 2. Jede Page in `AppShell`
Neue Seiten nicht mehr frei bauen, sondern in `AppShell` hängen.

### 3. Design Tokens nutzen
Keine Hardcoded-Farben/Abstände mehr, sondern `blunTokens`.

### 4. Check in package.json einhängen
```json
{
  "scripts": {
    "check:ui-consistency": "node scripts/check-ui-consistency.mjs"
  }
}
```

Danach im CI vor Merge laufen lassen.

## Hinweis
Die Importpfade sind für ein typisches Next.js/TypeScript Setup gedacht. Falls BLUN leicht anders strukturiert ist, nur die Pfade anpassen – die Logik bleibt gleich.
