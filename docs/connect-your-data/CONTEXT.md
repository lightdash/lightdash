# Connect your data

Everything between a person arriving at Lightdash and a project that is
connected and deploying: landing in an organization, connecting data sources
and semantic layer connections, and managing them and their credentials
afterwards. Builds on ADR 0001
(`docs/warehouse-connections/adr/0001-projects-hold-a-connection-mode.md`).

## Language

### Organizations and regions

**Organization**:
The top-level tenant a person belongs to. It holds projects, members and
settings.
_Avoid_: workspace, team, company, account

**Region**:
The multi-tenant Lightdash Cloud deployment an organization lives in, as users
see it, for example "Lightdash Cloud (EU)". A region cannot tell apart two
deployments in one region, so a dedicated instance is named by its Lightdash
URL instead.
_Avoid_: instance (internal and self-hosted wording only), app, eu1

**Lightdash URL**:
The address a person signs in at.
_Avoid_: instance URL, site

**Create / join / request to join**:
The three ways a person arrives in an organization. "Request to join" exists
only where the organization requires approval.
_Avoid_: sign up to an org, onboard into

### Data sources

**Data source**:
Anything a project gets data from. Its kinds are warehouse connection and
external source. More kinds may follow.
_Avoid_: database, warehouse (for the object)

**Warehouse connection**:
A data source that reaches a data warehouse. It may hold a shared credential;
a personal-only connection holds none. Shortened to "connection" only inside
this context.
_Avoid_: data source (when only warehouses apply), database, warehouse

**Connection number**:
The stable identity of a warehouse connection within a project, shown before
its name: "1 · Snowflake prod". The number belongs to the project's link, not
to the connection. Connection 1 is always the original connection and is never
empty. Numbers are never reused or reordered.
_Avoid_: primary, secondary, first, main

**Original connection** (from ADR 0001):
The project's existing warehouse connection, stored in `warehouse_credentials`.
It cannot be removed, and content that names no connection runs on it. The UI
shows it as connection 1, with no badge.
_Avoid_: primary connection, default connection

**Extra connection** (from ADR 0001):
A warehouse connection added in multi mode. It can be removed only when
nothing runs on it.
_Avoid_: secondary connection, additional connection

**Connection mode** (from ADR 0001):
Whether a project is `single` or `multi`. It is internal and never shown to
users.

**External source**:
A data source that is an uploaded file or a connected Google Sheet. Defined in
the External sources context.

### Semantic layer connections

**Semantic layer connection**:
Where a project's models come from: a git repository (dbt or Lightdash YAML),
a CLI deploy, or a manifest upload. A project has zero or more. Finishing
setup with a warehouse connection only is valid. The UI names its kind ("dbt
project on GitLab", "Deployed from the CLI").
_Avoid_: dbt source, dbt connection, dbt project (for the object), source,
repository (for the object), code source

**Runs on**:
The relation between a semantic layer connection and the one warehouse
connection its models query: "dbt project on GitHub · runs on connection 2".
Called "binding" in code.
_Avoid_: uses, bound to, attached to

**Namespace prefix**:
A prefix a semantic layer connection adds to its explore names. It is shown as
it is, including "none". Not settled: see Open questions.
_Avoid_: primary (to describe the unprefixed one)

**Deploy**:
Rebuilding a project's explores from all its semantic layer connections. A
deploy **compiles** each one, and compile is the step name shown in history
and errors.
_Avoid_: refresh dbt, sync, rebuild

**Test connection**:
A check that a warehouse connection can reach and authenticate to its
warehouse.
_Avoid_: validate, ping

### Credentials

**Credential**:
The authentication a warehouse connection runs under. Every credential has an
accountable owner.
_Avoid_: login, secret (for the object)

**Shared credential**:
A warehouse connection's own credential, used by everyone who has no personal
credential for it.
_Avoid_: service account, project credentials

**Personal credential**:
One user's credential for one warehouse connection. It replaces the
authentication fields only.
_Avoid_: user credentials, my warehouse connections

**Authentication policy**:
Which credentials a connection accepts: shared, personal only, or personal
with shared fallback. It belongs to the connection.
_Avoid_: authentication mode (when the method is meant)

**Authentication method**:
How a credential authenticates: OAuth, key pair, password or personal access
token.

### Connection catalogue (later delivery)

**Connection catalogue**:
The organization-level list of every warehouse connection.

**Connection scope**:
Project or organization. A **project connection** is available to one project
only. An **organization connection** (Enterprise) is available to authorized
projects; access is by grant, not shared with the whole organization.
_Avoid_: organization credential (retired: today it is one admin's token)

**Link**:
A project's numbered use of a connection. It holds the settings that are
specific to the project.

**Promote / demote**:
Change a connection's scope.

**Connection manager**:
A person who can edit, rotate, grant and remove an organization connection.

**Use grant**:
Permission to link an organization connection.

**Delegation**:
Linking a connection gives a project's members the connection's shared
identity.

**Allow raw SQL**:
A per-connection setting that covers the SQL runner, custom SQL, and AI and
MCP raw-SQL tools.

**Replace connection 1**:
Point a project's connection 1 at another connection of the same warehouse
type.

**Connection removed**:
The state of content whose link was removed.

### Sample data

**Playground**:
A project of sample data that an organization can explore before it connects
its own. Its badge reads "Sample data".
_Avoid_: demo project, sandbox, trial project, sample project

## Internal only

Connection mode, switch, route and binding stay in code and ADRs. They are
never shown to users.

## Open questions

- **Namespace prefix** conflicts with ADR 0001's rule that explore names are
  unique per project. The upgrade protocol decides it.
- **Identity against number:** a connection has a catalogue UUID and the
  number belongs to a link. Not decided: whether unlink and relink keep or
  burn the number, and whether one project can link the same connection twice.
