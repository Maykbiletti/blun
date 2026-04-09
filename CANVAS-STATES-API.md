# Canvas States - Save/Load API

**Status**: Ready for Deployment  
**Author**: Heinrich  
**Date**: 2026-04-09

## Übersicht

Canvas-States ermöglichen es Benutzern, ihre Canvas-Arbeit in benannte Snapshots zu speichern und jederzeit zu laden. Plus: Automatisches Autosave für Crash-Recovery.

## Datenbank-Schema

### Tabelle: `canvas_states`
```sql
- id: UUID (Primary Key)
- project_id: UUID (Fremdschlüssel)
- file_id: UUID (Fremdschlüssel)
- state_name: VARCHAR(255) - Name des States (z.B. "Draft v1", "Final")
- state_data: JSONB - Vollständiger Canvas-Zustand
- thumbnail: TEXT (Optional) - Base64-Thumbnail für UI
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
- created_by: VARCHAR(255) - Benutzername
- Unique Constraint: (file_id, state_name)
```

### Tabelle: `canvas_autosave`
```sql
- id: UUID (Primary Key)
- file_id: UUID (Unique, Fremdschlüssel)
- state_data: JSONB - Letzter Auto-Saved State
- last_saved: TIMESTAMP
- last_editor: VARCHAR(255)
```

## API Endpoints

### 1. States auflisten
```
GET /api/canvas/files/:fileId/states
```
**Antwort**:
```json
[
  {
    "id": "uuid-1",
    "state_name": "Draft v1",
    "created_at": "2026-04-09T10:00:00Z",
    "updated_at": "2026-04-09T10:05:00Z",
    "created_by": "user@blun.ai",
    "thumbnail": "data:image/png;base64,..."
  }
]
```

### 2. State speichern/aktualisieren
```
POST /api/canvas/files/:fileId/states
```
**Body**:
```json
{
  "state_name": "Final Version",
  "state_data": {
    "layers": [...],
    "objects": [...],
    "viewport": {...}
  },
  "thumbnail": "data:image/png;base64,..."
}
```
**Antwort**: Gespeicherter State mit ID

### 3. Spezifischen State abrufen
```
GET /api/canvas/states/:stateId
```
**Antwort**: State mit vollständigem `state_data`

### 4. State laden
```
GET /api/canvas/states/:stateId/load
```
**Antwort**: Nur `state_data` (optimiert für schnelles Laden)

### 5. State löschen
```
DELETE /api/canvas/states/:stateId
```

---

## Autosave-API

### 6. Autosave abrufen
```
GET /api/canvas/files/:fileId/autosave
```
**Antwort**: Letztes Autosave oder 204 No Content

### 7. Autosave aktualisieren
```
POST /api/canvas/files/:fileId/autosave
```
**Body**:
```json
{
  "state_data": { /* Canvas State */ }
}
```

---

## Client-Implementierungsbeispiel (JavaScript)

```javascript
// State speichern
async function saveCanvasState(fileId, stateName, canvasData, thumbnail) {
  const res = await fetch(`/api/canvas/files/${fileId}/states`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state_name: stateName,
      state_data: canvasData,
      thumbnail: thumbnail
    })
  });
  return res.json();
}

// State laden
async function loadCanvasState(stateId) {
  const res = await fetch(`/api/canvas/states/${stateId}/load`);
  return res.json();
}

// Autosave (z.B. nach jedem Change)
async function autosaveCanvas(fileId, canvasData) {
  await fetch(`/api/canvas/files/${fileId}/autosave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state_data: canvasData
    })
  });
}
```

---

## Migration ausführen

```bash
psql -d blun_db < src/db/migrations/canvas-states.sql
```

**Oder**: Dieter deployed über PM2/Deployment-Pipeline.

---

## Features

✅ Named Canvas States (beliebig viele Snapshots pro Datei)  
✅ Thumbnail-Vorschau  
✅ Auto-Save für Recovery  
✅ Zeitstempel + Editor-Tracking  
✅ Unique Constraint verhindert Duplikate  
✅ CASCADE Delete mit Projects/Files  

---

## Performance

- **Indizes**: project_id, file_id, created_at (für schnelle Queries)
- **JSONB**: Native PostgreSQL-Kompression für große State-Objekte
- **ON CONFLICT**: Upsert statt Delete+Insert (atomic)

