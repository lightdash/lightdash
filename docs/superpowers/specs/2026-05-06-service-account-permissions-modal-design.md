# Service Account Permissions Modal — Design

## Goal

Add a way to view a detailed list of permissions for a service account from the service accounts list table. Permissions data is faked for this iteration; no backend or API changes.

## User-facing behavior

- Each row in the service accounts table gains an info-icon button inside the existing **Scopes** column, placed after the scope badges or "N scopes" hover preview.
- Clicking the info button opens a modal titled **Permissions**, with the service account's description shown as a subtitle.
- The modal body is a flat list of permission entries, each formatted as `**Name** — description` (e.g. `**View charts** — Can view charts in this project`).
- The modal is dismissible via the standard close button / overlay click. Closing returns to the table with no state change.

## Component changes

**New file:** `packages/frontend/src/ee/features/serviceAccounts/ServiceAccountPermissionsModal.tsx`

- Uses `MantineModal` from `components/common/MantineModal` (per frontend style guide).
- Props: `{ isOpen: boolean; onClose: () => void; serviceAccount: ServiceAccount | undefined }`.
- Defines `FAKE_PERMISSIONS: Array<{ name: string; description: string }>` as a module-level constant — roughly 12 entries spanning dashboards, charts, projects, spaces, members. Values are illustrative only.
- Renders the description (if present) as a subtitle under the title, then a `<List>` of the fake permission entries.

**Updated file:** `packages/frontend/src/ee/features/serviceAccounts/ServiceAccountsTable.tsx`

- Inside `TableRow`, add an `IconInfoCircle` icon button rendered inline at the end of the Scopes cell (after the badges or "N scopes" hover content). Calls a new `onClickInfo` handler with the row's service account.
- In `ServiceAccountsTable`, add:
  - A second `useDisclosure` for the permissions modal.
  - State `serviceAccountToView: ServiceAccount | undefined` paired with open/close handlers (mirroring the existing delete-modal pattern).
  - Render `ServiceAccountPermissionsModal` next to the existing `ServiceAccountsDeleteModal`.

## Data

`FAKE_PERMISSIONS` is hardcoded in the new modal file. Same list rendered for every service account regardless of its actual `scopes` array. This is intentional for the prototype — wiring real scope-to-permission resolution is out of scope.

## Out of scope

- Backend or API changes.
- Wiring the modal to the service account's actual `scopes` list.
- Localization of permission names/descriptions.
- Permission grouping or action matrix (deferred; a flat list was preferred for this iteration).

## Non-goals / design decisions

- **Placement:** Info button lives in the Scopes column (option A from brainstorming) rather than the right-hand actions area, to keep scopes-related UI co-located.
- **Modal content:** Flat list (option A from brainstorming) rather than grouped-by-resource or action matrix, for fastest implementation of a fake-data prototype.
