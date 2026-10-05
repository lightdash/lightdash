# Embedding internals

How an embed request becomes an authenticated account, how content and feature
access are authorized, and how queries receive the external viewer's attributes.
Use this document when extending or debugging the backend/frontend embed path.

See the [public embedding reference](https://docs.lightdash.com/embed/reference)
for integration examples and SDK options, the
[permissions guide](../.context/PERMISSIONS.md#embedded-jwt-permissions) for the
scope contract, and [account patterns](./account-patterns.md) for shared endpoint
conventions. [Service accounts](./service-accounts.md) describes the actor's
underlying identity and role model.

## Concepts

| Concept | Internal representation and responsibility |
| --- | --- |
| Project embed configuration | The `embedding` database row holds an encrypted project signing secret, content allowlists, and `allow_all_*` settings. `EmbedModel.get` loads it with the project's organization. |
| Embed JWT | Signed claims described by `CreateEmbedJwt`: `content`, optional `writeActions`, `userAttributes`, viewer metadata in `user`, and token timestamps. |
| Embedded viewer | An `AnonymousAccount` with `authentication.type = 'jwt'`. Its `ExternalUser` has an `external::...` ID, not a registered user UUID. |
| Write/permission actor | A real Lightdash user or service account resolved into `embedWriteUser`. Supplies role permissions and attribution for supported writes. |
| Access controls | `account.access.controls` contains the effective custom and intrinsic attributes used for data restrictions. |
| Write context | `embedWriteContext` exposes capabilities such as chart creation and AI access after checking the actor and destination space. |

The optional `writeActions.userUuid` or `writeActions.serviceAccountUserUuid`
selects the actor. Selecting one does not sign the viewer in as that actor or
copy all of the actor's ordinary application abilities onto the viewer.
`user.externalId` identifies the external viewer; it does not select a role.
Do not use the viewer's synthesized ID in foreign keys that require a real user.

## Request flow

```text
Host application signs JWT with the project's embed secret
  -> EmbedProvider receives SDK token prop or direct/iframe URL fragment
  -> frontend API helper sends lightdash-embed-token header
  -> jwtAuthMiddleware resolves the requested project
  -> EmbedService.getAccountFromJwt
       loads project embed configuration and verifies JWT
       resolves content, viewer attributes, and optional actor
       computes write context
  -> fromJwt builds AnonymousAccount and its CASL abilities
  -> controller/service enforces content and operation access
  -> query path applies viewer attributes before warehouse execution
```

`EmbedProvider` keeps the token in memory and removes the fragment from the
direct embed URL after reading it. Decoding claims in the browser is for UI
state; signature verification happens on the backend. The frontend API helper
attaches the token to requests. `jwtAuthMiddleware` stores the resolved account
on `req.account`, which shared services should use instead of assuming a
passport `req.user` exists.

`decodeLightdashJwt` decrypts the stored project secret and calls
`jsonwebtoken.verify`. Signature failures and expired tokens raise
`ForbiddenError`. The generic `EmbedJwtSchema` validation currently logs errors
and returns the decoded token for backward compatibility; do not assume it
rejects every malformed claim. Unknown dashboard/AI `permissionsMode` values
are explicitly rejected before that compatibility path.

## Content boundaries

`content.type` selects the content resolver and ability builder. A valid
signature alone does not authorize every resource in the project.

| Token content type | Scope and relevant checks |
| --- | --- |
| `dashboard` | Names a dashboard by UUID or project-scoped slug. Dashboard query paths check the embed allowlist and that requested charts belong to the dashboard. |
| `chart` | Names a saved chart through `contentId`. Resolution checks its project and carries the chart and explore into the JWT account. |
| `dataApp` | Names an app. Account construction enforces the app allowlist; preview/query paths enforce the named app's access. Its abilities permit project-wide Explore queries, with viewer data restrictions still applied. |
| `aiAgent` | Names an agent. Requires an actor and destination space; AI services enforce agent, space, and thread access in addition to entry permissions. |
| `metricsCatalog` | Authorizes the project's embedded catalog surface; Explore access is evaluated separately. |
| `apiAccess` | Selects a service account through `content.serviceAccountUserUuid` for supported API operations. `getAccountApiAccessContext` resolves that actor; `getAccountWriteContext` rejects this token type. |

Keep content checks in the backend service, including on shared project
endpoints. Hiding a frontend control or granting an embed capability does not
replace resource ownership, project, allowlist, or space checks.

## Feature access

For dashboard embeds, `writeActions.permissionsMode` selects the source of
capability permissions:

| Mode | What grants dashboard capabilities |
| --- | --- |
| Omitted or `'default'` | JWT capability flags and their defaults |
| `'roles'` | The resolved actor's corresponding embed scopes |

In `'roles'` mode, JWT capability flags are ignored whether they are `true`,
`false`, or omitted. A resolved actor is required. Adding an actor without
selecting `'roles'` does not switch dashboard capabilities to role checks.
Write operations still require the actor's permissions and destination-space
access. Organization and project permission grants are additive.

For AI agent embeds, `'roles'` additionally requires `view:EmbedAiAgent` on top
of the existing AI access prerequisites. The Debug capability separately uses
`view:EmbedAiAgentDebug` in role mode and `content.canViewDebugInfo` in default
mode. This mode does not change standalone chart, data app, or metrics catalog
embeds.

`fromJwt` first projects the actor's applicable embed scopes through
`applyEmbedScopeAbilities`, then `applyEmbeddedAbility` builds the viewer's
content-specific abilities. In dashboard role mode, filter and parameter
interactivity are also derived from those abilities. The filter-interactivity
scope enables all dashboard filters; hidden-filter presentation remains intact.

The actor is resolved again on subsequent authenticated requests. Changing a
role's scopes does not require minting another JWT, but changing signed claims
such as the permission mode or viewer attributes does. Removing an embed scope
does not revoke dashboard capabilities on tokens using default mode.

## Writes and attribution

`getEmbedWriteUser` loads the actor in the project's organization. A regular
user must be active; a service-account actor must resolve to a service account
in that organization. `writeActions.spaceUuid` is required for this actor path.

`getEmbedWriteContext` resolves access to that space, checks that it belongs to
the embedded project, and evaluates the actor's relevant operation permissions.
Write services use `getAccountWriteContext` to obtain the registered actor and
the signed destination-space constraint. A visible save/edit control is not
itself authorization to write. Keep the viewer's query attributes separate
from the actor used to attribute and authorize the saved object.

## Attribute inheritance and precedence

Embed attributes are resolved independently of the actor and permission mode:

1. Start with organization-level attribute defaults.
2. Replace each matching key with the value supplied in JWT `userAttributes`.

**Neither a regular user's nor a service account's directly assigned or
group-derived attributes are inherited by the embedded viewer.** This applies
even with `permissionsMode: 'roles'`. Actor assignments are not an additional
restriction on the JWT values: there is no intersection or mismatch rejection.

For an organization default of `region = EU` and an actor assignment of
`region = US`:

| JWT `userAttributes.region` | Effective embed value |
| --- | --- |
| `"APAC"` | `["APAC"]` |
| `["APAC", "LATAM"]` | `["APAC", "LATAM"]`, replacing the default |
| Omitted | `["EU"]` |
| Omitted, with no organization default | `[]` |

At the resolver level, `null` and `undefined` values are skipped, leaving the
default in place; an explicit empty array replaces the default with `[]`.
Other attribute keys retain their defaults. Missing values do not imply
unrestricted access: the query's attribute requirements still apply.

These effective attributes supply model `sql_filter` expressions and
table/field `required_attributes` and `any_attributes` checks. Role grants for
features such as Explore or export do not remove those data restrictions.
Put each external viewer's tenant/data restrictions in the server-signed JWT;
do not rely on the actor's stored assignments to constrain an embed.

This differs from ordinary signed-in user or direct service-account requests,
which resolve stored user/group assignments. Changing an actor's assigned
attributes therefore does not update the embedded viewer's attributes.

## Email identity

The intrinsic `${lightdash.user.email}` attribute comes from JWT `user.email`.
It is not loaded from the user identified by `writeActions.userUuid`, and there
is no fallback to the actor's email when the JWT omits it.

## Query execution and extension points

The dashboard query path in `EmbedService._runEmbedQuery` reads the JWT account's
access controls, calls `getFilteredExplore`, and passes custom and intrinsic
attributes into `QueryComposer`. Shared project query paths use
`ProjectService.getUserAttributes`, which returns the JWT controls directly.
Preserve these controls when adding exports, drilldowns, or alternative query
paths; substituting the write actor changes the data-access context.

For new functionality, follow [account patterns](./account-patterns.md): prefer
the canonical project endpoint and an explicit account type/guard over adding
another legacy `/api/v1/embed/...` endpoint. Grant the minimum required ability
for the relevant content type and enforce it in the shared service. New embed
capabilities should use scopes rather than adding JWT boolean flags.

## Debugging map

| Symptom | Start here |
| --- | --- |
| Token rejected | Request project, token header, project embed secret, expiry, and `decodeLightdashJwt`. Never log the raw token or signing secret. |
| Feature unavailable | Signed permission mode, resolved actor, all effective role grants, then viewer abilities from `fromJwt`. Check the embed scope rather than only its ordinary-app equivalent. |
| Content unavailable | Content type/identifier, project membership of the resource, embed allowlist, and endpoint-specific resource checks. |
| Save or AI access denied | Actor resolution, signed destination space, and `getEmbedWriteContext`. |
| Unexpected rows or fields | Organization defaults plus JWT attributes, then model/field attribute rules. Actor assignments are not the embed's data context. |

## Implementation references

- [JWT claims](../packages/common/src/ee/embed/index.ts): `CreateEmbedJwt` and
  the compatibility validation schema.
- [EmbedModel](../packages/backend/src/ee/models/EmbedModel.ts): project embed
  configuration and content allowlists.
- [EmbedProvider](../packages/frontend/src/ee/providers/Embed/EmbedProvider.tsx)
  and [frontend API helper](../packages/frontend/src/api.ts): token transport
  and viewer UI state.
- [JWT middleware](../packages/backend/src/middlewares/jwtAuthMiddleware/jwtAuthMiddleware.ts)
  and [verification](../packages/backend/src/auth/lightdashJwt.ts): request
  authentication and token validation.
- [EmbedService](../packages/backend/src/ee/services/EmbedService/EmbedService.ts):
  `getAccountFromJwt` resolves the actor and attributes separately;
  `getEmbedUserAttributes` merges defaults and JWT values and resolves email;
  `getEmbedWriteUser` resolves the user or service-account actor.
- [JWT account construction](../packages/backend/src/auth/account/account.ts):
  `fromJwt` stores attribute controls separately from `embedWriteUser`;
  `getAccountWriteContext` and `getAccountApiAccessContext` resolve actor access.
- [ProjectService](../packages/backend/src/services/ProjectService/ProjectService.ts):
  `getUserAttributes` returns JWT access controls before the stored-assignment
  lookup used for registered users and service accounts.
- [Embed scope projection](../packages/common/src/authorization/embedPermissions.ts):
  `applyEmbedScopeAbilities` copies the actor's allowed embed capabilities.
- [Content abilities](../packages/common/src/authorization/jwtAbility.ts):
  `applyEmbeddedAbility` builds the viewer's content-specific grants.
