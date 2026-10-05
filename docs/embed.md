# Embed permissions and user attributes

An embedded viewer authenticates with a signed JWT. The optional
`writeActions.userUuid` or `writeActions.serviceAccountUserUuid` identifies the
Lightdash actor used for role checks and write actions. The viewer remains a
separate JWT account; selecting an actor does not sign the viewer in as that actor.

See the [public embedding reference](https://docs.lightdash.com/embed/reference)
for token examples and the feature-to-scope mapping, and the
[permissions guide](../.context/PERMISSIONS.md#embedded-jwt-permissions) for the
authorization contract.

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
of the existing AI access prerequisites. This mode does not change standalone
chart, data app, or metrics catalog embeds.

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

## Implementation references

- [EmbedService](../packages/backend/src/ee/services/EmbedService/EmbedService.ts):
  `getAccountFromJwt` resolves the actor and attributes separately;
  `getEmbedUserAttributes` merges defaults and JWT values and resolves email;
  `getEmbedWriteUser` resolves the user or service-account actor.
- [JWT account construction](../packages/backend/src/auth/account/account.ts):
  `fromJwt` stores attribute controls separately from `embedWriteUser`.
- [ProjectService](../packages/backend/src/services/ProjectService/ProjectService.ts):
  `getUserAttributes` returns JWT access controls before the stored-assignment
  lookup used for registered users and service accounts.
- [Embed scope projection](../packages/common/src/authorization/embedPermissions.ts):
  `applyEmbedScopeAbilities` copies the actor's allowed embed capabilities.
