<summary>
Resolves the effective space role for every user who can access a space.

Given three layers of access data (organization, project, direct space), it computes
each user's final `SpaceMemberRole` (viewer | editor | admin), whether they have direct
access, and what role they inherited from. This is the single source of truth for
"who can access this space and with what permissions."

</summary>

<howToUse>

**Entry point:** `resolveSpaceAccess(input: SpaceAccessInput): SpaceAccess[]`

Pass in all access data for a space and get back one `SpaceAccess` record per user
who has valid access. Users without access are silently excluded from the result.

The only consumer is `SpacePermissionService.getAccessContext()` in the backend,
which gathers DB data and feeds it to this resolver.

</howToUse>

<codeExample>

```typescript
import { resolveSpaceAccess } from './spaceAccessResolver';

const access = resolveSpaceAccess({
    spaceUuid: 'space-123',
    isPrivate: true,
    directAccess: [
        /* DirectSpaceAccess[] from user/group space memberships */
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
- **`isPrivate` maps to `inheritsFromOrgOrProject` (inverted):** The `isPrivate` boolean
  in `SpaceAccessInput` is the legacy way to express whether org/project roles flow into
  a space. With the inheritance chain model, think of each space as a door in a
  corridor. `inherit_parent_permissions` controls whether the door is open or closed:

    ```text
    Organization role
      └─► Project role
            └─🚪 Root space (open/closed)
                  └─🚪 Child space (open/closed)
                        └─🚪 Grandchild space
    ```

    If every door is open (`inherit_parent_permissions: true` all the way up including
    root), org/project roles walk straight through → `inheritsFromOrgOrProject: true`
    (= old `isPrivate: false`, "public"). If any door is closed, roles can't pass →
    `inheritsFromOrgOrProject: false` (= old `isPrivate: true`, "private") — only
    users with a key (direct access) get past the closed door.

    | Old (CASL)         | New (inheritance chain)           | Meaning                         |
    | ------------------ | --------------------------------- | ------------------------------- |
    | `isPrivate: false` | `inheritsFromOrgOrProject: true`  | Org/project roles flow down     |
    | `isPrivate: true`  | `inheritsFromOrgOrProject: false` | Only direct access grants entry |

    The resolver's behavior is the same either way — only the source of the boolean changes.
    See `SpacePermissionModel.getInheritanceChain()` for how the chain is evaluated.

</importantToKnow>

<links>

- Types: @packages/common/src/types/space.ts (`SpaceAccessInput`, `DirectSpaceAccess`, etc.)
- Role utilities: @packages/common/src/utils/projectMemberRole.ts
- Tests: @packages/common/src/authorization/space/spaceAccessResolver.test.ts
- Consumer: @packages/backend/src/services/SpaceService/SpacePermissionService.ts

</links>
