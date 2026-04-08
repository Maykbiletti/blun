# ADR-002: Agent Network Graph Architektur

**Status:** Proposed | **Datum:** 2026-04-07 | **Autorin:** Greta, Agent Architektin

---

## Kernkonzept

Interaktiver Graph: **Knoten = Agents**, **Linien = aktive Kommunikation**, **Operator im Zentrum**. Live-Updates ueber WebSocket (ADR-001).

```
             +----------+
    +--------|  Greta   |--------+
    |        |  (blau)  |        |
    |        +----------+        |
+---+------+              +------+---+
|  Felix   |              | Hannah   |
| (violet) |              | (orange) |
+---+------+              +------+---+
    |    +--------------+        |
    +----|  OPERATOR *  |--------+
    +----|    (gold)    |--------+
    |    +--------------+        |
+---+------+              +------+---+
| Guenter  |              |   Max    |
| (gruen)  |              |  (cyan)  |
+----------+              +----------+
```

---

## 1. Datenmodell

### Agent Node

```typescript
interface AgentNode {
  id: string;                    // "agent_greta_001"
  name: string;
  role: string;
  department: Department;        // -> Bestimmt Farbe
  status: AgentStatus;
  activity: number;              // 0-100 -> Bestimmt Knotengroesse
}

enum Department {
  AGENT_SYSTEM    = "agent_system",     // #3B82F6 Blau
  INFRASTRUCTURE  = "infrastructure",   // #10B981 Gruen
  FRONTEND        = "frontend",         // #8B5CF6 Violett
  BACKEND         = "backend",          // #F59E0B Orange
  DATA            = "data",             // #06B6D4 Cyan
  DEVOPS          = "devops",           // #EF4444 Rot
  SECURITY        = "security",         // #6B7280 Grau
  PRODUCT         = "product",          // #EC4899 Pink
}

enum AgentStatus {
  ACTIVE  = "active",    // Pulsierender Ring
  IDLE    = "idle",      // Solid Border
  BUSY    = "busy",      // Orange Ring
  OFFLINE = "offline",   // Grau, gestrichelt
}
```

### Operator Node (Sonderknoten — immer Zentrum)

```typescript
interface OperatorNode {
  id: "operator";
  type: "operator";
  name: string;
  status: "online" | "away" | "offline";
  position: { x: 0; y: 0 };     // Fixiert im Zentrum
  style: {
    color: "#FFD700";            // Gold
    size: 100;                   // Groesster Knoten
    icon: "star";
  };
}
```

### Communication Edge (Linien)

```typescript
interface CommunicationEdge {
  id: string;
  source: string;                // Agent-ID oder "operator"
  target: string;
  type: EdgeType;
  active: boolean;               // -> animierte Linie wenn true
  weight: number;                // 1-10 -> Liniendicke
  lastMessage: number;           // Timestamp
}

enum EdgeType {
  COMMAND    = "command",        // Operator -> Agent (gelb, dick)
  REPORT     = "report",        // Agent -> Operator (gruen)
  DELEGATION = "delegation",    // Agent -> Agent (blau, gestrichelt)
  DATA_FLOW  = "data_flow",     // Agent <-> Agent (grau, gepunktet)
  BROADCAST  = "broadcast",     // 1 -> viele (duenn)
}
```

### Visuelles Mapping

```
KNOTEN:
  Operator:  Gold #FFD700, 100px, Stern, Zentrum fixiert
  Agent:     Department-Farbe, radius = clamp(24, activity*0.6+24, 72) px

LINIEN:
  command:    gelb, 3px solid       active -> Partikel-Animation
  report:     gruen, 2px solid      inactive -> opacity 0.4
  delegation: blau, gestrichelt
  data_flow:  grau, gepunktet
  broadcast:  duenn, 1px
```

---

## 2. Layout: Operator-Zentriert (Radial)

```
Ring 1 (nah, 150px):    activity > 70  — engste Mitarbeiter
Ring 2 (mitte, 300px):  activity 30-70 — regelmaessig aktiv
Ring 3 (aussen, 450px): activity < 30  — selten aktiv / offline

Innerhalb jedes Rings: sortiert nach Department (Clustering)
```

---

## 3. API Contracts

| Endpoint | Methode | Zweck |
|---|---|---|
| `/api/v1/graph/network` | GET | Kompletter Graph (Initial Load) |
| `/api/v1/graph/nodes/:id` | GET | Agent-Detail + Verbindungen |
| `/api/v1/graph/operator/connections` | GET | Operator-Uebersicht |
| `/api/v1/graph/layout` | PUT | Positionen persistieren |

### Initial Load Response

```json
{
  "version": 42,
  "operator": { "id": "operator", "name": "Du", "status": "online" },
  "nodes": [
    { "id": "agent_greta_001", "name": "Greta", "department": "agent_system", "status": "active", "activity": 85 }
  ],
  "edges": [
    { "id": "edge_001", "source": "operator", "target": "agent_greta_001", "type": "command", "active": true, "weight": 5 }
  ]
}
```

---

## 4. WebSocket Events (ADR-001 konform)

| Event | Trigger |
|---|---|
| `graph.node.status` | Agent wechselt Status |
| `graph.node.activity` | Aktivitaetswert aendert sich |
| `graph.edge.activate` | Neue Nachricht auf Kante |
| `graph.edge.deactivate` | 30s keine Nachricht |
| `graph.edge.weight` | Kantengewicht aktualisiert |
| `graph.snapshot` | Reconnect -> Full State |

```json
{
  "v": 1,
  "id": "evt_graph_042",
  "type": "graph.edge.activate",
  "ts": 1712505600000,
  "seq": 143,
  "payload": {
    "edgeId": "edge_op_greta_live",
    "source": "operator",
    "target": "agent_greta_001",
    "edgeType": "command"
  }
}
```

---

## 5. State Management (Zustand)

```typescript
interface GraphStore {
  // Data
  operator: OperatorNode;
  nodes: Map<string, AgentNode>;
  edges: Map<string, CommunicationEdge>;
  version: number;

  // UI
  selectedId: string | null;
  filters: {
    departments: Department[];
    minActivity: number;
    edgeTypes: EdgeType[];
    showOffline: boolean;
  };

  // Actions
  applySnapshot(state: NetworkGraphState): void;
  updateNode(id: string, changes: Partial<AgentNode>): void;
  activateEdge(id: string, source: string, target: string, type: EdgeType): void;
  deactivateEdge(id: string): void;
  selectNode(id: string | null): void;
}
```

**Update-Flow:**
1. `GET /graph/network` -> `applySnapshot()`
2. WS `graph.node.status` -> `updateNode()`
3. WS `graph.edge.activate` -> `activateEdge()` -> Partikel-Animation startet
4. Reconnect -> `graph.snapshot` -> Full Resync

---

## 6. Interaktion

| Aktion | Effekt |
|---|---|
| Hover Knoten | Verbundene Kanten highlighten, Rest dimmen |
| Klick Knoten | Detail-Panel: Agent-Info, Metriken, letzte Nachrichten |
| Doppelklick Agent | Chat oeffnen |
| Klick Operator | Uebersicht: aktive Verbindungen, Commands, Reports |
| Scroll | Zoom |
| Drag | Pan |

---

## 7. Tech-Stack

| Komponente | Technologie |
|---|---|
| Rendering | React Flow (Canvas/WebGL) |
| State | Zustand |
| Realtime | WebSocket (ADR-001) |
| Layout | Custom Radial + d3-force |
| Backend | Node.js + Express |
| Persistenz | PostgreSQL |

---

## 8. Offene Punkte

- [ ] Performance-Test: 200+ Nodes
- [ ] Cluster-Collapse: Department als Super-Node
- [ ] Replay-Modus (Zeitstrahl)
- [ ] Export als PNG/SVG
- [ ] Mobile-View: Liste statt Graph
- [ ] Mini-Map fuer grosse Netzwerke

---

**Abhaengigkeit:** ADR-001 (WebSocket-Layer) muss zuerst stehen.
