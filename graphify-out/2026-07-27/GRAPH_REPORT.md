# Graph Report - .  (2026-06-25)

## Corpus Check
- Corpus is ~30,212 words - fits in a single context window. You may not need a graph.

## Summary
- 183 nodes · 448 edges · 9 communities (8 shown, 1 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_AI Assistant and Chat Logic|AI Assistant and Chat Logic]]
- [[_COMMUNITY_App Layout and Administration|App Layout and Administration]]
- [[_COMMUNITY_Archive and Calendar Management|Archive and Calendar Management]]
- [[_COMMUNITY_Voice Assistant and Personnel|Voice Assistant and Personnel]]
- [[_COMMUNITY_Backend and Package Dependencies|Backend and Package Dependencies]]
- [[_COMMUNITY_Component Registration and Initialization|Component Registration and Initialization]]
- [[_COMMUNITY_TypeScript Compiler Options|TypeScript Compiler Options]]
- [[_COMMUNITY_Linear Congruential Generator Utilities|Linear Congruential Generator Utilities]]

## God Nodes (most connected - your core abstractions)
1. `Personnel` - 23 edges
2. `ShiftType` - 23 edges
3. `GlobalDutySettings` - 18 edges
4. `compilerOptions` - 16 edges
5. `Hejleh Rostering Application` - 15 edges
6. `ScheduleEntry` - 14 edges
7. `Department` - 13 edges
8. `jalaliToGregorian()` - 13 edges
9. `getDaysInJalaliMonth()` - 13 edges
10. `SchedulerProps` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Tailwind CSS CDN` --conceptually_related_to--> `App()`  [INFERRED]
  index.html → App.tsx
- `Vazirmatn Typography` --conceptually_related_to--> `App()`  [INFERRED]
  index.html → App.tsx
- `Docx Library CDN` --conceptually_related_to--> `Scheduler()`  [INFERRED]
  index.html → components/Scheduler.tsx
- `FileSaver Library CDN` --conceptually_related_to--> `Scheduler()`  [INFERRED]
  index.html → components/Scheduler.tsx
- `LocalStorage and Firestore Data Synchronization Flow` --rationale_for--> `App()`  [EXTRACTED]
  reviwe.md → App.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Frontend External Libraries via CDN** — index_tailwind_cdn, index_sheetjs_cdn, index_docx_cdn, index_filesaver_cdn [EXTRACTED 1.00]
- **Hejleh Scheduling Core Components** — components_scheduler_scheduler, services_conflictdetector_detectconflicts, components_personnelmanager_personnelmanager, components_rulesmanager_rulesmanager [EXTRACTED 1.00]

## Communities (9 total, 1 thin omitted)

### Community 0 - "AI Assistant and Chat Logic"
Cohesion: 0.12
Nodes (26): AiAssistantProps, distributionDescriptions, suggestionPrompts, weekendDistributionDescriptions, AiLoadingModal(), AiLoadingModalProps, loadingMessages, ArchiveViewerProps (+18 more)

### Community 1 - "App Layout and Administration"
Cohesion: 0.10
Nodes (22): ICONS, DepartmentManager(), DepartmentManagerProps, RulesManagerProps, SettingsManager(), DEFAULT_AI_SETTINGS, DEFAULT_RULES, INITIAL_SCHEDULE (+14 more)

### Community 2 - "Archive and Calendar Management"
Cohesion: 0.23
Nodes (17): ArchiveViewer(), ReportData, years, CalendarManager(), DEFAULT_GLOBAL_SETTINGS, NATIONAL_HOLIDAYS, startServer(), detectConflicts() (+9 more)

### Community 3 - "Voice Assistant and Personnel"
Cohesion: 0.13
Nodes (15): CalendarManagerProps, EditableCellProps, PersonnelManagerProps, SettingsManagerProps, ShiftTypeManager(), ShiftTypeManagerProps, CalendarEvent, ChangeLogEntry (+7 more)

### Community 4 - "Backend and Package Dependencies"
Cohesion: 0.08
Nodes (23): dependencies, express, firebase, @google/genai, react, react-dom, devDependencies, esbuild (+15 more)

### Community 5 - "Component Registration and Initialization"
Cohesion: 0.13
Nodes (21): App(), AiAssistant(), LiveVoiceAssistant(), PersonnelManager(), RulesManager(), Scheduler(), Firestore Security Rules, Docx Library CDN (+13 more)

### Community 6 - "TypeScript Compiler Options"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+9 more)

## Knowledge Gaps
- **55 isolated node(s):** `ICONS`, `suggestionPrompts`, `distributionDescriptions`, `weekendDistributionDescriptions`, `loadingMessages` (+50 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Hejleh Rostering Application` connect `Component Registration and Initialization` to `App Layout and Administration`, `Archive and Calendar Management`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `Personnel` connect `AI Assistant and Chat Logic` to `App Layout and Administration`, `Archive and Calendar Management`, `Voice Assistant and Personnel`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `ShiftType` connect `AI Assistant and Chat Logic` to `App Layout and Administration`, `Archive and Calendar Management`, `Voice Assistant and Personnel`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Hejleh Rostering Application` (e.g. with `Hejleh README Document` and `Running Hejleh Locally`) actually correct?**
  _`Hejleh Rostering Application` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ICONS`, `suggestionPrompts`, `distributionDescriptions` to the rest of the system?**
  _58 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AI Assistant and Chat Logic` be split into smaller, more focused modules?**
  _Cohesion score 0.12222222222222222 - nodes in this community are weakly interconnected._
- **Should `App Layout and Administration` be split into smaller, more focused modules?**
  _Cohesion score 0.1032258064516129 - nodes in this community are weakly interconnected._