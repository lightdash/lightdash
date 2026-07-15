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

| Layer | Responsibilities |
|---|---|
| Common | Defines the portable resource and API response types used by the CLI and backend. |
| Backend controller | Exposes authenticated `/code` endpoints and generated OpenAPI contracts. |
| Backend service | Loads resources, builds the portable representation, validates uploads, resolves identity, calculates changes, and persists them. |
| CLI | Selects the project or organization, reads and writes files, chooses deterministic filenames, calls the `/code` API, and presents progress and per-file failures. |

The CLI should not contain lists of valid domain values, compare uploaded
resources with database resources, or coordinate lower-level create and update
endpoints. For example, it should not know which scopes are valid for a custom
role or calculate which scopes need to be added and removed.

## Download flow

1. The CLI resolves the project or organization and the local content root.
2. The CLI calls the resource's backend `GET .../code` endpoint.
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
   .../code` endpoint.
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

Parsed YAML should be treated as unknown input and sent to the backend. The CLI
must not ship a snapshot of server domain rules such as supported permission
scopes, allowed transitions, or mutable fields.

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

- `GET /api/v2/orgs/{orgUuid}/roles/code`
- `POST /api/v2/orgs/{orgUuid}/roles/code`

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
- calls the two `/roles/code` endpoints;
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

- `GET /api/v2/orgs/{orgUuid}/users/code`
- `POST /api/v2/orgs/{orgUuid}/users/code`

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

- `GET /api/v2/orgs/{orgUuid}/groups/code`
- `POST /api/v2/orgs/{orgUuid}/groups/code`

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

1. Define a versioned portable type and typed API responses in
   `packages/common`.
2. Add authenticated TSOA `GET .../code` and `POST .../code` endpoints.
3. Implement externalization, runtime validation, identity resolution, diffing,
   and persistence in the backend service layer.
4. Return explicit create, update, and no-change outcomes from the backend.
5. Add a small CLI file adapter for directory discovery, YAML serialization,
   API calls, and reporting.
6. Keep organization resources under `lightdash/<resource>/` and project
   resources within the existing project content layout.
7. Test domain rules in backend service tests, file behavior in focused CLI
   tests, and the complete download/create/update/no-op/failure flow end to end.

If implementing the CLI requires importing backend domain maps, reproducing
validation rules, fetching current resources to calculate a diff, or calling
several persistence endpoints, the responsibility is probably in the wrong
layer and should move behind the resource's `/code` endpoint.
