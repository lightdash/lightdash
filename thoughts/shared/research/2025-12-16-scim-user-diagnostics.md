---
date: 2025-12-16T13:57:45Z
researcher: Claude Code
git_commit: ff1f8f9cfeebf9143d63c0812a7924ae60172c46
branch: main
repository: lightdash
topic: "SCIM User Diagnostics - Tracking User Creation/Update Source"
tags: [research, scim, users, organization-settings, database]
status: complete
last_updated: 2025-12-16
last_updated_by: Claude Code
---

# Research: SCIM User Diagnostics - Tracking User Creation/Update Source

**Date**: 2025-12-16T13:57:45Z
**Researcher**: Claude Code
**Git Commit**: ff1f8f9cfeebf9143d63c0812a7924ae60172c46
**Branch**: main
**Repository**: lightdash

## Research Question

How can we provide diagnostics showing when users were last updated and how they were last updated (SCIM vs regular registration) in the organization settings UI?

## Summary

The current system does **not track the creation or update source** for users. While the database has `created_at` and `updated_at` timestamps, there is no field indicating whether a user was created via SCIM, invitation, or self-registration. Analytics events track `context: 'scim'` but this is not persisted to the database. The organization settings UI (`UsersTable.tsx`) currently displays name, email, role, groups, and status but not timestamps or source information.

## Detailed Findings

### 1. SCIM Implementation

SCIM is an enterprise feature located in `/packages/backend/src/ee/`.

#### SCIM Controllers
- **ScimUserController**: `packages/backend/src/ee/controllers/scimUserController.ts`
  - `POST /api/v1/scim/v2/Users` - Create user (line 173-189)
  - `PUT /api/v1/scim/v2/Users/{userUuid}` - Replace user (line 199-216)
  - `PATCH /api/v1/scim/v2/Users/{userUuid}` - Patch user (line 226-243)
  - `DELETE /api/v1/scim/v2/Users/{userUuid}` - Delete user (line 252-266)

#### SCIM Service
- **ScimService**: `packages/backend/src/ee/services/ScimService/ScimService.ts`
  - `createUser()` (lines 393-515): Creates user via `userModel.createUser()` then adds to organization
  - `updateUser()` (lines 518-727): Updates user fields conditionally
  - `patchUser()` (lines 774-863): Applies RFC 6902 JSON Patch operations
  - `deleteUser()` (lines 866-951): Removes user from system

#### Analytics Tracking (Not Persisted)
The SCIM service tracks analytics with `context: 'scim'`:
```typescript
// Line 478 in ScimService.ts (user creation)
this.analytics.track({
    event: 'user.created',
    properties: {
        context: 'scim',  // NOT persisted to database
        createdUserId: newUser.userUuid,
        userConnectionType: 'password',
    },
});
```

### 2. Regular User Registration Flows

#### Direct Registration (No Invite)
- **Controller**: `packages/backend/src/controllers/userController.ts` (lines 71-104)
- **Service**: `packages/backend/src/services/UserService.ts`
  - `registerOrActivateUser()` (lines 1157-1179)
  - `registerUser()` (lines 1181-1233)
- **Model**: `packages/backend/src/models/UserModel.ts`
  - `createUser()` (lines 728-759)

#### Invitation Flow
- **Service**: `UserService.createPendingUserAndInviteLink()` (lines 361-461)
- **Model**: `UserModel.createPendingUser()` (lines 641-679)
- **Activation**: `UserService.activateUserFromInvite()` (lines 245-304)

#### OpenID/SSO Flow
- **Service**: `UserService.loginWithOpenId()` (lines 545-856)
- Creates entry in `openid_identities` table

### 3. Database Schema

#### Users Table
**Entity**: `packages/backend/src/database/entities/users.ts`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | integer | Primary key (auto-increment) |
| `user_uuid` | uuid | External identifier |
| `first_name` | text | |
| `last_name` | text | |
| `is_active` | boolean | Can user login |
| `is_setup_complete` | boolean | Onboarding status |
| `created_at` | timestamp | Account creation time |
| `updated_at` | timestamp | Last modification time |
| `is_marketing_opted_in` | boolean | |
| `is_tracking_anonymized` | boolean | |

**No fields exist for**:
- Creation source (SCIM, invite, self-registration, SSO)
- Last update source (SCIM, manual, API)

#### Related Authentication Tables
- `password_logins` - Users with password authentication
- `openid_identities` - Users with SSO authentication
- `invite_links` - Pending invitations

A user is "pending" when they have no entry in either `password_logins` or `openid_identities`.

### 4. Organization Settings UI

#### Component Location
**File**: `packages/frontend/src/components/UserSettings/UsersAndGroupsPanel/UsersTable.tsx`

#### Current Columns Displayed (lines 163-375)
1. **User** (line 163-259): Name, email, status badges (inactive/pending/expired)
2. **Role** (line 262-294): Dropdown to change organization role
3. **Groups** (line 296-343): Count of groups with hover preview
4. **Actions** (line 345-375): Delete and resend invite options

#### Data Type
**File**: `packages/common/src/types/organizationMemberProfile.ts` (lines 33-65)

```typescript
export interface OrganizationMemberProfile {
    userUuid: string;
    userCreatedAt: Date;      // Available but not displayed
    userUpdatedAt: Date;      // Available but not displayed
    firstName: string;
    lastName: string;
    email: string;
    organizationUuid: string;
    role: OrganizationMemberRole;
    isActive: boolean;
    isInviteExpired?: boolean;
    isPending?: boolean;
}
```

The `userCreatedAt` and `userUpdatedAt` fields are already available in the API response but are not currently rendered in the UI.

### 5. API Endpoints

**Controller**: `packages/backend/src/controllers/organizationController.ts`

- `GET /api/v1/org/users` - List organization members (line 184-217)
- `GET /api/v1/org/users/{userUuid}` - Get single member (line 224-238)
- `PATCH /api/v1/org/users/{userUuid}` - Update member role (line 269-289)
- `DELETE /api/v1/org/user/{userUuid}` - Remove member (line 296-313)

## Code References

### SCIM User Creation
- `packages/backend/src/ee/services/ScimService/ScimService.ts:393-515` - createUser method
- `packages/backend/src/ee/services/ScimService/ScimService.ts:478` - Analytics context: 'scim'

### Regular User Creation
- `packages/backend/src/services/UserService.ts:1181-1233` - registerUser method
- `packages/backend/src/services/UserService.ts:361-461` - createPendingUserAndInviteLink

### Database Schema
- `packages/backend/src/database/entities/users.ts:3-14` - DbUser type
- `packages/backend/src/database/migrations/20241028143602_add_updated_at_to_users.ts` - Added updated_at

### Frontend Components
- `packages/frontend/src/components/UserSettings/UsersAndGroupsPanel/UsersTable.tsx:163-375` - Column definitions
- `packages/common/src/types/organizationMemberProfile.ts:33-65` - OrganizationMemberProfile type

## Architecture Documentation

### Current User Creation Sources (Not Tracked)
1. **Self-registration**: User signs up directly via `/register`
2. **Invitation**: Admin creates invite, user accepts via `/invite/{code}`
3. **SCIM provisioning**: Identity provider creates user via SCIM API
4. **SSO first login**: User authenticates via OpenID, account auto-created
5. **Email domain join**: User joins org via allowed email domain

### Current User Update Sources (Not Tracked)
1. **Manual admin action**: Via organization settings UI
2. **SCIM sync**: Identity provider updates user via SCIM API
3. **User self-service**: User updates own profile
4. **API**: Direct API call with personal access token

## Key Observations

1. **Timestamps exist but aren't displayed**: `userCreatedAt` and `userUpdatedAt` are in the API response but the frontend doesn't render them.

2. **No source tracking**: Neither the database nor the API tracks HOW a user was created or updated.

3. **Analytics not persisted**: The SCIM service passes `context: 'scim'` to analytics but this is sent to external analytics (Rudderstack) and not stored in the database.

4. **Authentication method can be inferred**: You can determine if a user uses password vs SSO by checking `password_logins` and `openid_identities` tables, but this doesn't indicate creation source.

## Open Questions

1. Should creation source be stored as an enum (e.g., `scim`, `invite`, `self_registration`, `sso`) or as a foreign key to a sources table?

2. Should update source tracking be a single field (last update source) or a full audit log?

3. Should the UI show the raw `created_at`/`updated_at` timestamps or relative times (e.g., "3 days ago")?

4. Should SCIM-created users be visually distinguished (e.g., badge/icon) or just filterable?
