# Analytics sample content

The backend-owned bundle in `packages/backend/src/analytics/systemExplores/sampleContent.ts`
defines a usage overview dashboard and its dashboard-owned charts. The definitions
use the regular typed chart configuration and the existing system explores. They
are compiled with the backend; installation needs neither a CLI process nor local
content files on a separate worker.

Project creation installs the sample after compiling the explores. Existing
projects can use **Refresh** in organization analytics settings,
which calls `POST /api/v1/org/analytics-project/sample-content`. Both paths require
the existing analytics feature flag, development environment, and org-admin guard.
The organization and analytics project are resolved on the server.

Installation uses the existing space/chart/dashboard models in a single database
transaction. A project row lock serializes installations. Content and its registry
record either commit together or roll back together; retries cannot leave duplicate
or partial samples. Existing user content is never looked up by a bundled slug or
updated. Normal slug allocation handles collisions. The charts belong to the sample
dashboard rather than appearing as standalone saved charts.

`analytics_content_installations` records:

- Project UUID and stable bundle key.
- Successfully installed version and timestamp.
- Actual dashboard UUID and the chart UUIDs indexed by stable bundle item keys.

Names and slugs can change without changing the recorded identity. Duplicating a
dashboard does not copy the registry record. Deleting an analytics project cascades
its installation record; collected event files remain untouched.

## Future updates

This first version installs once. Repeat calls preserve all existing content,
including edits to the sample. Bumping the bundle version alone does **not** update
installed dashboards. Automatic updates, manual sync, and deleted-item repair are
tracked in PROD-11152.

Future synchronization must target the recorded UUIDs, verify that each item still
belongs to the analytics project, and preserve user-created copies and content that
merely has a matching slug. Preserve keys and field identifiers across releases;
introduce new keys for new charts. Update the installed version only after all
content updates succeed. Treat missing/deleted managed items explicitly, without
taking over unrelated content or silently resurrecting deliberately deleted items.
