# Content as code architecture

Content as code turns Lightdash resources into portable, reviewable files that
can be downloaded from one instance and uploaded to another. This document
describes the responsibility boundary between the CLI and the backend, how the
portable representation is built, and where validation belongs.

The core rule is:

> The backend owns Lightdash domain behavior. The CLI owns local file
> processing and delegates resource validation and persistence to `/code`
> endpoints.

This keeps every API client consistent, prevents domain rules from being
reimplemented in the CLI, and lets the backend apply authorization and
validation against current server capabilities.

## Responsibility boundary

| Layer              | Responsibilities                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Common             | Defines the portable resource and API response types used by the CLI and backend.                                                                                 |
| Backend controller | Exposes authenticated `/code` endpoints and generated OpenAPI contracts.                                                                                          |
| Backend service    | Loads resources, builds the portable representation, validates uploads, resolves identity, calculates changes, and persists them.                                 |
| CLI                | Selects the project or organization, reads and writes files, chooses deterministic filenames, calls the `/code` API, and presents progress and per-file failures. |

The CLI should not contain lists of valid domain values, compare uploaded
resources with database resources, or coordinate lower-level create and update
endpoints. For example, it should not know which scopes are valid for a custom
role or calculate which scopes need to be added and removed.

## Implementation structure

Content as code is a first-class subsystem rather than a set of unrelated CLI
handlers:

- Portable contracts are split by resource under
  `packages/common/src/types/contentAsCode/`. The existing `coder.ts` exports
  remain as a compatibility facade.
- `ProjectCoderController` owns project routes and
  `OrganizationCoderController` owns organization routes. The two controllers
  are separate because TSOA controllers have one route prefix. Canonical routes
  use `/code/{resource}`; the previous resource-first routes remain deprecated
  compatibility aliases until after 17 August 2026.
- Backend resource handlers own externalization, reference conversion,
  comparison, and persistence. `CoderService` remains as a compatibility facade
  while callers migrate to those handlers.
- CLI resources use `CodeResourceDefinition` adapters for scope, discovery,
  parsing, identity, filenames, dependencies, and ordering. Charts, dashboards,
  nested spaces, scheduled content, AI-agent bulk operations, and data-app
  bundles retain specialized orchestration where their layouts require it.
- Filename allocation is centralized and handles Unicode normalization,
  bounded names, stable collision suffixes, case-insensitive collisions, safe
  paths, and reuse of an existing file owned by the same portable identity.

New resources should use these extension points instead of adding another
standalone download/upload implementation.

## Download flow

1. The CLI resolves the project or organization and the local content root.
2. The CLI calls the resource's backend `GET .../code/{resource}` endpoint.
3. The backend checks access and loads the database resources.
4. The backend converts each database resource into its portable as-code type.
5. The CLI serializes the returned resources into deterministic YAML files.

Building the portable representation is a backend responsibility because it
requires knowledge of the database model and the public resource contract. The
representation should:

- include a format `version`;
- contain semantic, portable fields rather than database implementation
  details;
- omit UUIDs, timestamps, ownership metadata, and other instance-specific
  values unless they are part of the portable identity;
- use stable ordering for unordered collections so repeated downloads produce
  clean diffs;
- use names or slugs that have a defined identity rule on upload.

The CLI may sort YAML keys and normalize filenames, but it should not reshape
the resource returned by the backend.

## Upload flow

1. The CLI discovers and parses the relevant YAML files.
2. The CLI sends each portable document to the resource's backend `POST
   .../code/{resource}` endpoint.
3. The backend authenticates and authorizes the request.
4. The backend validates the portable document and its domain invariants.
5. The backend resolves the existing resource using the documented portable
   identity.
6. The backend creates the resource, applies the required update, or determines
   that there are no changes.
7. The backend returns a `CREATE`, `UPDATE`, or `NO_CHANGES` action.
8. The CLI aggregates those actions and reports any per-file failures.

Sending resources individually is useful when files are independent. A bad
file can fail without preventing valid sibling files from being processed. The
backend still owns the transaction and atomicity of each individual resource.
Omitting a file does not delete the remote resource unless a resource explicitly
defines deletion semantics.

## Validation model

Validation is split by ownership rather than duplicated across layers.

### CLI validation

The CLI validates only local file and bundle concerns:

- the expected directory exists and contains supported files;
- YAML can be parsed;
- filenames can be generated safely and deterministically;
- files that would represent the same portable identity are reported as a
  bundle conflict;
- processing continues after an independent file fails.

Parsed YAML is treated as unknown input. Shared parsers may validate structural
contract concerns needed for safe local processing, including the document
shape, version, content type, and portable identity. The backend repeats the
required contract checks and remains responsible for domain rules.

The CLI must not ship a snapshot of server domain rules such as supported
permission scopes, allowed transitions, or mutable fields. Structural parsing
must preserve documented legacy behavior, including resources where
`contentType` was historically optional and unknown keys were accepted.

### Backend validation

The backend validates everything needed to understand and persist the
resource:

- authentication and authorization for the target project or organization;
- supported format version and expected fields;
- field types and required values;
- references to other Lightdash resources;
- current server capabilities and allowed enum-like values;
- resource-specific invariants and immutable fields;
- uniqueness and identity constraints;
- whether the requested operation is a create, update, or no-op.

TypeScript types and the generated OpenAPI schema document the API contract,
but they do not replace runtime validation in the service. YAML, older clients,
and direct API callers can all provide values that were not produced by the
current TypeScript code.

Validation errors should identify the invalid field or value. The CLI adds the
source filepath to the backend error when reporting a failed document.

## Project and organization content

Project content uses project-scoped `/code` endpoints and is selected through
the normal project download and upload workflow. Organization content uses
organization-scoped `/code` endpoints and an explicit `--organization` mode.

Both scopes use the standard `lightdash/` content root. Organization resources
live in resource-specific subdirectories rather than an additional
`organization/` directory. For example:

```text
lightdash/
  custom-roles/
    developer-view-only.yml
```

The CLI success message refers to the shared `lightdash/` parent because future
organization resources will use the same root.

## Resource catalog

| Resource             | Scope        | Portable identity                | Primary location                         |
| -------------------- | ------------ | -------------------------------- | ---------------------------------------- |
| Charts               | Project      | Slug                             | `lightdash/charts/` or nested spaces     |
| SQL charts           | Project      | Slug                             | Chart layouts using `.sql.yml`           |
| Dashboards           | Project      | Slug                             | `lightdash/dashboards/` or nested spaces |
| Spaces               | Project      | Full hierarchy path              | `.space.yml` files                       |
| Virtual views        | Project      | Slug                             | `lightdash/virtual-views/`               |
| AI agents            | Project      | Slug                             | `lightdash/ai-agents/`                   |
| Scheduled deliveries | Project      | Project-scoped slug              | `lightdash/scheduled-deliveries/`        |
| Alerts               | Project      | Project-scoped slug              | `lightdash/alerts/`                      |
| Google Sheets syncs  | Project      | Project-scoped slug              | `lightdash/google-sheets/`               |
| Custom roles         | Organization | Exact role name                  | `lightdash/custom-roles/`                |
| Users                | Organization | Lowercase primary email          | `lightdash/users/`                       |
| Groups               | Organization | Exact, case-sensitive group name | `lightdash/groups/`                      |

Data apps are deliberately outside the YAML resource registry because they are
multi-file source bundles. They may reuse shared path-safety and reporting
utilities without pretending to be single-document resources.

Project APIs use `/api/v1/projects/{projectUuid}/code/{resource}`. Organization
APIs use `/api/v2/orgs/{orgUuid}/code/{resource}`. The resource segments are
`charts`, `sqlCharts`, `dashboards`, `spaces`, `virtualViews`, `aiAgents`,
`scheduledDeliveries`, `alerts`, `googleSheets`, `roles`, `users`, and `groups`.
The legacy resource-first routes are deprecated in OpenAPI and should not be
used by new clients.

## Optional project resources

Virtual views, AI agents, alerts, scheduled deliveries, and Google Sheets syncs
are opt-in for download through their resource selectors, `--include-*` flags,
or `--include-all`. Upload processes matching files already present on disk
unless the corresponding `--skip-*` option is supplied. This distinction is
intentional: a normal download must not delete or rewrite optional local
resources that were not fetched.

Google Sheets documents contain portable destination metadata. Content-as-code
uploads validate the payload and permissions but do not call Google Drive to
validate the spreadsheet URL. This allows CI and service-account deployments
without the uploader's personal Google OAuth token. Executing an enabled sync
still requires usable Google credentials for the scheduler owner.

## Spaces and access

Project space definitions use `.space.yml` files. New flat downloads place them
under `lightdash/spaces/`:

```text
lightdash/
  spaces/
    finance.space.yml
```

Use `--root-spaces` to write new flat space files at the `lightdash/` root for
the legacy layout. With `--nested`, each definition stays in its per-space
folder alongside that space's `charts/` and `dashboards/` directories.
Existing files are always updated in their current location, so downloading
does not duplicate or automatically move root, `spaces/`, or nested files.
Upload discovers all of these layouts recursively.

Each space file contains:

```yaml
contentType: space
version: 1
spaceName: Finance
slug: company/finance
access:
  inheritParentPermissions: false
  projectMemberAccessRole: viewer
  users:
    - email: owner@example.com
      role: admin
  groups:
    - name: Finance team
      role: editor
```

The endpoints are:

- `GET /api/v1/projects/{projectUuid}/code/spaces`
- `POST /api/v1/projects/{projectUuid}/code/spaces`

The previous `GET` and `POST /api/v1/projects/{projectUuid}/spaces/code` routes
are deprecated compatibility aliases shared with the other migrated resources.

The full hierarchy path in `slug` is the portable identity. Uploads process
parents before descendants and create missing spaces unless
`--skip-space-create` is used. Changing the path creates another space; missing
files do not move, delete, or revoke a remote space.

For compatibility with older downloads that only contain a leaf space file,
metadata-only uploads can recreate missing ancestor folders using names derived
from each path segment. Version 1 files with an explicit `access` policy remain
strict: every parent must already exist or have its own successfully applied
space file. With `--skip-space-create`, missing spaces and their dependent
content are reported as skipped while unrelated existing content continues.

When `access` is present it replaces the complete direct policy: inheritance,
the all-project-members role, direct human users, and direct groups. Empty
arrays explicitly remove grants. Effective inherited access and expanded group
members are never serialized. Legacy space files without `version` and
`access` remain valid and update metadata without changing access.

If direct access contains a principal without a portable identity, download
still writes the space as a legacy metadata-only file and warns that access was
omitted. Re-uploading that file leaves access unchanged; it never applies a
partial policy that could revoke the unsupported grant. Descendant spaces are
still downloaded independently when their own access is portable.

Full project downloads and uploads include spaces by default. Use
`--skip-spaces` to leave them alone or `--spaces-only` to operate only on space
definitions. `--root-spaces` is a download-only legacy layout option and cannot
be combined with `--nested`. Filtered chart and dashboard operations never
reconcile unrelated space access. They still maintain metadata-only files for
the referenced spaces so names remain portable; an existing versioned `access`
block is preserved rather than replaced by embedded metadata.

If the access-aware space endpoint is unavailable, a normal full download
continues with the legacy metadata-only spaces embedded in chart and dashboard
responses. `--spaces-only` remains strict because it has no content response to
use as a fallback.

Changing a space name or access policy requires actual permission to manage the
resolved space. Broad content-as-code permission does not bypass restricted
space authorization, and an unchanged legacy metadata-only file is treated as
a no-op after confirming the caller can view the space.

Keep organization deployments in this order:

1. `lightdash upload --organization`
2. Project spaces
3. Project content

## Custom roles reference implementation

Custom roles are the reference implementation for organization-scoped content
as code.

The portable document is defined by `CustomRoleAsCode` in
`packages/common/src/types/roles.ts`:

```yaml
version: 1
name: Developer view only
description: Can view production content
level: project
scopes:
  - view:Dashboard
  - view:SavedChart
```

The endpoints are:

- `GET /api/v2/orgs/{orgUuid}/code/roles`
- `POST /api/v2/orgs/{orgUuid}/code/roles`

The backend implementation lives in
`packages/backend/src/services/RolesService/RolesService.ts`. It:

- exports user-defined roles and sorts their scopes;
- rejects unknown fields, unsupported versions, invalid names, duplicate or
  unknown scopes, and invalid scope/level combinations;
- identifies a role by its exact name within the organization, matching the
  database uniqueness constraint;
- creates a missing role;
- compares description and scopes for an existing role;
- treats the role level as immutable;
- applies scope additions and removals and supports clearing a description;
- returns `CREATE`, `UPDATE`, or `NO_CHANGES`;
- does not delete roles that are absent from the local directory.

For compatibility, an existing role may retain a legacy scope that is no
longer assignable at its level. Scope-level validation is applied to newly added
scopes, so downloading and uploading an unchanged legacy role remains a no-op.

The CLI implementation lives under
`packages/cli/src/handlers/organizationContent/`. It only:

- reads and writes `lightdash/custom-roles/*.yml`;
- treats a missing or empty custom-roles directory as a no-op;
- creates safe filenames and disambiguates normalized filename collisions;
- rejects duplicate role names within the local bundle;
- calls the two `/code/roles` endpoints;
- continues after a backend rejection and prints the filepath with the error;
- aggregates backend actions into created, updated, unchanged, and failed
  counts.

It intentionally does not list roles through the general roles API, validate
scope names, calculate scope diffs, or call the lower-level create and patch
role endpoints.

## Users

Organization users are stored under `lightdash/users/*.yml`:

```yaml
version: 1
email: analyst@example.com
disabled: false
role:
  type: system
  name: editor
```

The endpoints are:

- `GET /api/v2/orgs/{orgUuid}/code/users`
- `POST /api/v2/orgs/{orgUuid}/code/users`

Email is the portable identity and is normalized to lowercase. An upload
creates a missing organization member or reconciles the existing member's
organization role and disabled state. A custom role is referenced by its exact
organization-level role name, so organization uploads process custom roles
before users.

Credentials are not portable, so authentication status is not written to user
files. A missing user is staged without an authentication method and reported
as awaiting authentication. Uploads never add or remove credentials. Omitting a
user file does not remove the remote user.

Invitations are a separate side effect and are not sent by default. Passing
`lightdash upload --organization --send-invites` sends invitations only to
eligible staged users. Authenticated users, disabled users, and users with a
valid invitation are skipped. Without that flag, users authenticate through
the instance's existing domain, SSO, or manually triggered invitation flows.

Uploads also preserve the organization admin invariant. Enabled admin
promotions are processed before admin demotions or disables, and the backend
rejects any individual operation that would leave the organization without an
enabled authenticated admin.

## Groups

Organization groups are stored under `lightdash/groups/*.yml`:

```yaml
version: 1
name: Finance
members:
  - alice@example.com
  - bob@example.com
```

The endpoints are:

- `GET /api/v2/orgs/{orgUuid}/code/groups`
- `POST /api/v2/orgs/{orgUuid}/code/groups`

The exact, case-sensitive group name is the portable identity. Upload creates a
missing group or replaces the complete membership of an existing group. Every
member email must resolve to the primary email of a non-internal user in the
destination organization before any mutation begins. Empty membership is
represented explicitly as `members: []`.

Group files intentionally exclude UUIDs, project roles, space access, AI-agent
access, user attributes, and ownership metadata. Changing the name creates a
new group and leaves the original group intact; missing files do not delete
groups.

Organization uploads run dependency phases sequentially: custom roles, then
users, then groups. A failed phase prevents every dependent phase from
starting, so group emails are resolved only after the complete users phase has
succeeded.

SCIM and content as code should not manage the same group. Groups do not yet
record management provenance, so this limitation cannot be enforced by the
first version.

## Adding another content-as-code resource

Use this sequence when adding a new resource:

1. Define a versioned portable type, parser, resource identity, and typed API
   responses in the appropriate `packages/common/src/types/contentAsCode/`
   module.
2. Add methods to the appropriate scope controller without changing an existing
   route family or operation ID.
3. Implement a backend resource handler for externalization, runtime validation,
   reference conversion, identity resolution, comparison, and persistence.
4. Return explicit create, update, and no-change outcomes from the backend.
5. Register a `CodeResourceDefinition` with its folder, accepted extensions,
   identity, parser, filename profile, and dependency metadata. Connect the
   definition to the project or organization orchestration for its API calls and
   permission checks. Use a specialized hook only when the resource is not a
   normal YAML document.
6. Keep organization resources under `lightdash/<resource>/` and project
   resources within the existing project content layout.
7. Add parser, filename, adapter, backend-domain, and round-trip tests, including
   partial failures and dependency skipping where applicable.

## Evolving an existing resource

Portable contracts are intentionally curated and do not automatically mirror
database models. Adding a field to a chart, dashboard, or another domain model
does not automatically expose it in YAML. Each new field must be classified as
portable, read-only metadata, or internal state.

For a portable field, update the document type, externalization, create/update
mapping, comparison logic, generated schema, and round-trip tests together. If
the new meaning is incompatible with existing files, increment the resource
version and add an explicit normalizer or migration path. Never spread an
entire persistence model into a portable document: UUIDs, ownership, secrets,
and instance-specific state must remain excluded.

Charts, dashboards, and spaces do not yet have universal database-enforced
project-scoped slug uniqueness. Application-level locking protects current
content-as-code and promotion creation paths, but callers must not assume a slug
is a globally reliable unique identifier. Resolution should detect ambiguity,
and new relationships must use UUIDs until database constraints or a dedicated
portable identity are introduced.

If implementing the CLI requires importing backend domain maps, reproducing
validation rules, fetching current resources to calculate a diff, or calling
several persistence endpoints, the responsibility is probably in the wrong
layer and should move behind the resource's `/code` endpoint.
