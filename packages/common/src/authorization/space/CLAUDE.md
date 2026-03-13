<summary>
Resolves the effective space role for every user who can access a space.

Given three layers of access data (organization, project, direct space), it computes
each user's final `SpaceMemberRole` (viewer | editor | admin), whether they have direct
access, and what role they inherited from. This is the single source of truth for
"who can access this space and with what permissions."

</summary>

<howToUse>

**Entry point:** `resolveSpaceAccess(input: SpaceAccessWithInheritanceInput): SpaceAccess[]`

Pass in all access data for a space (including direct access from all ancestors in the
inheritance chain) and get back one `SpaceAccess` record per user who has valid access.
Users without access are silently excluded from the result.

The only consumer is `SpacePermissionService.getSpacesCaslContext()` in the backend,
which gathers DB data via inheritance chains and feeds it to this resolver.

</howToUse>

<codeExample>

```typescript
import { resolveSpaceAccess } from './spaceAccessResolver';

const access = resolveSpaceAccess({
    spaceUuid: 'space-123',
    inheritsFromOrgOrProject: false, // true = org/project roles flow down
    chainDirectAccess: [
        // Direct access from each space in the inheritance chain (leaf to root)
        {
            spaceUuid: 'space-123',
            directAccess: [
                /* DirectSpaceAccess[] */
            ],
        },
        {
            spaceUuid: 'parent-456',
            directAccess: [
                /* DirectSpaceAccess[] */
            ],
        },
    ],
    projectAccess: [
        /* ProjectSpaceAccess[] from project memberships/groups */
    ],
    organizationAccess: [
        /* OrganizationSpaceAccess[] from org memberships */
    ],
});

// Result: SpaceAccess[] — one entry per user with valid access
// { userUuid, role, hasDirectAccess, inheritedRole, inheritedFrom, projectRole }
```

</codeExample>

<importantToKnow>

- **Admins always get in:** Any user with admin at org/project level becomes a space admin,
  even on private spaces.
- **Private spaces exclude non-direct users:** Non-admin users need explicit direct access
  (user or group) to access private spaces. Public spaces grant access to anyone with an
  org/project role.
- **Org MEMBER role = no implicit access:** The `MEMBER` org role converts to `undefined`
  project role, so these users need project-level or direct space access.
- **Direct user access beats group access:** When a user has both `USER_ACCESS` and
  `GROUP_ACCESS` on a space, the user-level role wins regardless of which is higher.
- **`projectRole` vs `inheritedRole`:** `projectRole` only considers org + direct project
  membership. `inheritedRole` includes all sources (groups, space groups). These serve
  different purposes downstream.
- **Role conversions lose granularity:** `INTERACTIVE_VIEWER` → `VIEWER` and
  `DEVELOPER` → `EDITOR` when converting to space roles. See
  @packages/common/src/utils/projectMemberRole.ts for full mappings.
- **`inheritsFromOrgOrProject` controls org/project role flow:** Think of each space as
  a door in a corridor. `inherit_parent_permissions` controls whether the door is open
  or closed:

    ```text
    Organization role
      └─► Project role
            └─🚪 Root space (open/closed)
                  └─🚪 Child space (open/closed)
                        └─🚪 Grandchild space
    ```

    If every door is open (`inherit_parent_permissions: true` all the way up including
    root), org/project roles walk straight through → `inheritsFromOrgOrProject: true`.
    If any door is closed, roles can't pass → `inheritsFromOrgOrProject: false` — only
    users with direct access get past the closed door.

    | `inheritsFromOrgOrProject` | Meaning                         |
    | -------------------------- | ------------------------------- |
    | `true`                     | Org/project roles flow down     |
    | `false`                    | Only direct access grants entry |

    See `SpacePermissionModel.getInheritanceChains()` for how the chain is evaluated.

</importantToKnow>

<links>

- Types: @packages/common/src/types/space.ts (`SpaceAccessWithInheritanceInput`, `ChainSpaceDirectAccess`, `DirectSpaceAccess`, etc.)
- Role utilities: @packages/common/src/utils/projectMemberRole.ts
- Tests: @packages/common/src/authorization/space/spaceAccessResolver.test.ts
- Consumer: @packages/backend/src/services/SpaceService/SpacePermissionService.ts

</links>
