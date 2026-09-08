# Project roadmap preview

Open `/dev/roadmap` on the Vite development server. The route is development-only. The existing customer roadmap remains unchanged while the new experience is reviewed.

The Kanban board uses synthetic data from an asynchronous `RoadmapApi` implementation. It supports search, project and request pagination, project panels, existing request details, and a non-writing design-partner entry point. Requests load when a project is opened. No Linear or central roadmap requests are made by the preview.

Use the scenario selector for populated, empty, pending, error/retry, access-denied, removed-project, missing-title, pagination, and expiry cases. Reset restarts the selected scenario. Expiry uses 12 seconds for review rather than the intended 10-minute production window. Removed and blank-title projects' requests move to Other requests. Storybook exposes the same component and scenarios under Roadmap / Project board.

The sample columns are Backlog, Planned, In progress, and Paused. Stage assignments are supplied separately as preview data; this does not change the title-only public project contract. The live project-stage contract needs to follow the reviewed grouping decision.

## Integration handoff

The shared types and `roadmapApi` adapter describe parallel v2 project and request reads. They are not connected to the existing customer page or a production v2 backend in this change. Keep legacy v1 schemas and request visibility rules intact. Scope real query-cache keys to the authenticated organization.

Live delivery requires the central catalog and instance proxy, provider validation and authorization tests, and central support deployed before the consuming instance. The catalog must include only direct customer-to-project needs, omit inactive/archived/deleted/unlinked/blank-title projects, and stop displaying expired titles when a refresh fails. Keep shared project data separate from organization-specific associations. Design-partner submissions and broader rollout remain separate work.
