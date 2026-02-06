<summary>
Resolves which users can access a space and what role they get.

Takes raw access data from three sources (organization, project, direct space grants) and produces
a flat list of `SpaceShare` objects — one per user who has access. This is the single source of truth
for "who can see this space and with what permissions."
</summary>

<howToUse>

**Entry point:** `resolveSpaceAccess(input: SpaceAccessInput): SpaceShare[]`

Build a `SpaceAccessInput` with data from the database, call `resolveSpaceAccess`, get back the resolved list of users with their effective roles.

<codeExample>

```typescript
import { resolveSpaceAccess } from '@lightdash/common';

const shares = resolveSpaceAccess({
    spaceUuid: 'abc-123',
    isPrivate: true,
    directAccess: [...], // from space_share + space_group_access tables
    projectAccess: [...], // from project_memberships + group memberships
    organizationAccess: [...], // from organization_memberships
    userInfo: userInfoMap, // Map<userUuid, { firstName, lastName, email }>
});
// Returns SpaceShare[] — one entry per user who has access
```

</codeExample>
</howToUse>

<importantToKnow>

**Role resolution priority:**

1. **Admin override** — Any user who is admin at org, project, or group level automatically gets `SpaceMemberRole.ADMIN`
2. **Direct access** — If user has explicit space access, user-level access takes precedence over group-level
3. **Public space inheritance** — Non-private spaces inherit the user's highest project role (converted to a space role)
4. **Private space exclusion** — Private spaces require either admin status or direct access; otherwise the user is excluded

**Key behaviors:**

- Users not found in `userInfo` map are silently excluded from results
- `inheritedFrom` tracks which access source gave the user their highest role (useful for UI display)
- `projectRole` only considers org + direct project membership — it intentionally excludes group-based project roles
- `hasDirectAccess` indicates whether the user has any explicit space-level grant (user or group)

**Currently called from:** `SpacePermissionService.getAccessContext()` in the backend, which feeds the resolved access into the CASL authorization layer.

</importantToKnow>

<links>

- Input/output types: @packages/common/src/types/space.ts
- Role conversion utilities: @packages/common/src/utils/projectMemberRole.ts
- Backend caller: @packages/backend/src/services/SpaceService/SpacePermissionService.ts
- Tests: @packages/common/src/authorization/space/spaceAccessResolver.test.ts

</links>
