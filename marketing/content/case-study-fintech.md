# Fallbeispiel: Wie BLUN ein FinTech-Startup mit Agent-Automation skalierte

Als das Berliner FinTech-Startup **FlowLedger** im Wachstum auf 120.000 aktive Nutzer sprang, wurde ein Problem sichtbar: Das Team war stark im Produkt, aber operativ überlastet. Support-Tickets stiegen pro Monat um 38 Prozent, Onboarding-Prozesse waren in Teilen manuell, und das Compliance-Team hing bei wiederkehrenden Prüfungen regelmäßig hinterher. Das Resultat war ein bekanntes Muster: steigende Kosten, längere Reaktionszeiten und ein wachsendes Risiko für operative Fehler.

BLUN startete mit einer zweiwöchigen Analyse entlang der Kernprozesse in Support, Customer Operations und Compliance. Statt pauschaler Automatisierung wurde jeder Prozess nach drei Kriterien bewertet: Volumen, Regelklarheit und Fehlerkosten. Daraus entstand ein klarer Rollout in drei Agent-Layern:

1. **Support-Agent-Layer** für wiederkehrende Kundenanfragen (Konto-Setup, Limits, Transaktionsstatus, Dokumenten-Upload).
2. **Operations-Agent-Layer** für Onboarding-Schritte inklusive Datenvalidierung, Follow-up-Logik und interner Übergaben.
3. **Compliance-Agent-Layer** für standardisierte KYC-/AML-Vorprüfungen mit dokumentierten Entscheidungsgründen.

Technisch wurde die Lösung in die bestehende Architektur von FlowLedger integriert, ohne große Systemmigration. Die Agenten arbeiteten auf definierten Policy-Regeln, hatten klar begrenzte Rechte und gaben jede kritische Entscheidung an menschliche Owner weiter. Für alle automatisierten Aktionen wurde ein Audit-Trail eingeführt, damit jede Entscheidung revisionssicher nachvollziehbar blieb.

Die Einführung erfolgte bewusst stufenweise. In Phase eins liefen Agenten im Schattenmodus und erzeugten nur Vorschläge, damit das Team Qualität und Treffergenauigkeit messen konnte. In Phase zwei wurden klar definierte Low-Risk-Fälle vollautomatisiert. Erst in Phase drei kamen komplexere Workflows hinzu, inklusive Eskalation an Fachverantwortliche bei Unsicherheiten. So blieb das Tagesgeschäft stabil, während die Automatisierung kontrolliert skaliert wurde.

Nach acht Wochen im Produktivbetrieb zeigten sich belastbare Effekte:

- **54 Prozent weniger First-Level-Support-Last** bei gleichbleibender Kundenzufriedenheit.
- **32 Prozent schnellere Onboarding-Durchlaufzeit** bei Neukunden.
- **41 Prozent weniger manuelle Compliance-Prüfschritte** in Standardfällen.
- **Senkung der operativen Bearbeitungskosten um 27 Prozent** im betroffenen Prozessbereich.

Wichtig war nicht nur die Effizienz. FlowLedger gewann vor allem operative Stabilität: Peak-Lasten konnten ohne zusätzliche Headcount-Wellen abgefangen werden, und Teams arbeiteten wieder an Ausnahmen statt an Routine.

Der zentrale Hebel war die Kombination aus **Agent-Automation plus klarer Governance**. BLUN hat nicht einfach Tasks automatisiert, sondern ein belastbares Betriebsmodell gebaut: mit Verantwortlichkeiten, Eskalationspfaden und messbaren Service-Levels. Genau dadurch blieb die Lösung in einem regulierten FinTech-Umfeld nicht nur schnell, sondern auch kontrollierbar.

Für FlowLedger bedeutete das einen klaren Shift: weniger reaktiver Betrieb, mehr Fokus auf Produkt, Wachstum und regulatorisch saubere Skalierung.
