# Nested Space Permissions E2E Testing Strategy

## Overview

This document outlines a comprehensive E2E testing strategy for the nested space permissions feature. The feature allows nested spaces to either inherit permissions from their parent chain (additive model) or define their own explicit permissions by cutting the inheritance tie.

## Key Feature Requirements to Test

### 1. Permission Inheritance Model

- Nested spaces inherit permissions from parent by default (`inheritParentPermissions: true`)
- Permissions are **additive** - child spaces aggregate permissions from all ancestors
- When a user appears in multiple spaces in the chain, the **highest role wins**
- Root spaces: `inheritParentPermissions` equals `!isPrivate` (public inherit from project, private are standalone)

### 2. Breaking Inheritance

- Nested spaces can toggle `inheritParentPermissions` to `false` ("unsynced")
- When inheritance is disabled, **all effective permissions are copied** to the space as direct permissions
- After breaking, only direct permissions apply (no longer inherits from parents)

### 3. Adding Permissions (Additive)

- Even when inheriting, spaces can **add additional permissions** (additive to inherited)
- These direct permissions stack with inherited ones

### 4. UI/UX Requirements

- Breadcrumbs should show parent names even for inaccessible spaces
- Each breadcrumb should indicate `hasAccess` status
- Delete impact should show all affected spaces (including inaccessible ones with names visible)
- Space settings should clearly show effective permissions

### 5. Edge Cases

- Cascade deletion of parent with inaccessible children
- Permission checks on content (charts/dashboards) in nested spaces
- Search endpoints respecting nested permissions
- Moving content between spaces with different permission models

---

## Test Data Structure

### Existing Seed Data (SPACE_TREE_1, SPACE_TREE_2)

```
ADMIN-OWNED (SPACE_TREE_1):
├── Parent Space 1 (public, inherits from project)
│   ├── Child Space 1.1
│   │   ├── Grandchild Space 1.1.1
│   │   └── Grandchild Space 1.1.2
│   ├── Child Space 1.2
│   │   ├── Grandchild Space 1.2.1
│   │   └── Grandchild Space 1.2.2
│   │       └── Great Grandchild Space 1.2.2.1
│   └── Child Space 1.3
│       └── Grandchild Space 1.3.1
│           └── Great Grandchild Space 1.3.1.1
│
├── Parent Space 2 (private, no additional access)
│   └── Child Space 2.1
│       └── Grandchild Space 2.1.1
│
├── Parent Space 3 (private, editor has EDITOR access)
│   └── Child Space 3.1
│
└── Parent Space 5 (private, group access via SEED_GROUP_2)
    └── Child Space 5.1

EDITOR-OWNED (SPACE_TREE_2):
└── Parent Space 4 (private)
    └── Child Space 4.1
```

### Required Additional Test Data

We need to seed specific scenarios for inheritance testing:

```
INHERITANCE_TEST_TREE (new):
├── Inherit Root (public)
│   ├── Inherit Child (inherit=true)
│   │   └── Inherit Grandchild (inherit=true)
│   └── Unsynced Child (inherit=false, explicit VIEWER for specific user)
│       └── Restricted Grandchild (inherit=true from Unsynced Child)
│
└── Private Root (private, admin only)
    ├── Additive Child (inherit=true, EDITOR added for editor user)
    │   └── Deep Additive (inherit=true)
    └── Isolated Child (inherit=false, only specific user has access)
```

---

## Test Categories

### Category 1: API Tests - Permission Inheritance Logic

**File: `packages/e2e/cypress/e2e/api/nestedSpacePermissions.cy.ts`**

#### 1.1 Basic Inheritance Behavior

```typescript
describe('Nested Space Permission Inheritance', () => {
    describe('Default inheritance behavior', () => {
        it(
            'should create nested space with inheritParentPermissions=true by default',
        );
        it('should inherit permissions from public parent space');
        it(
            'should inherit permissions from private parent space with explicit access',
        );
        it('should aggregate permissions from entire ancestry chain');
    });

    describe('Highest role wins', () => {
        it(
            'should return highest role when user has different roles in chain (VIEWER + EDITOR = EDITOR)',
        );
        it('should return ADMIN when user has ADMIN anywhere in chain');
        it('should maintain direct access flag correctly');
    });

    describe('Breaking inheritance', () => {
        it(
            'should copy all effective permissions when setting inheritParentPermissions=false',
        );
        it('should only use direct permissions after breaking inheritance');
        it('should not inherit new permissions added to parent after breaking');
    });
});
```

#### 1.2 Access Control Scenarios

```typescript
describe('Access Control with Inheritance', () => {
    describe('View access', () => {
        it('admin should see all spaces regardless of inheritance');
        it('editor should see public spaces and spaces with access in chain');
        it(
            'viewer should only see public spaces and spaces with explicit access',
        );
        it('user with access to parent should see inheriting child');
        it(
            'user with access to parent should NOT see unsynced child without direct access',
        );
    });

    describe('Manage access', () => {
        it('user with EDITOR role on parent can manage inheriting child');
        it('user with EDITOR role on parent cannot manage unsynced child');
        it(
            'user with direct ADMIN on child can manage regardless of parent access',
        );
    });

    describe('Content access', () => {
        it('user can view chart in space where they have inherited access');
        it('user cannot view chart in unsynced space without direct access');
        it('user can create dashboard in space with inherited EDITOR role');
    });
});
```

#### 1.3 Adding Permissions (Additive Model)

```typescript
describe('Additive Permissions', () => {
    it('should allow adding user access to inheriting space');
    it('should combine inherited + direct permissions');
    it('should show hasDirectAccess=true for directly added user');
    it('should show hasDirectAccess=false for inherited user');
    it('should allow adding group access to inheriting space');
});
```

#### 1.4 Edge Cases

```typescript
describe('Edge Cases', () => {
    describe('Deep nesting', () => {
        it(
            'should correctly aggregate permissions through 4+ levels of nesting',
        );
        it('should respect inheritance break at any level in chain');
    });

    describe('Mixed inheritance states', () => {
        it(
            'inheriting child of unsynced parent inherits from unsynced parent only',
        );
        it('permissions stop at first inherit=false in ancestry chain');
    });

    describe('Permission changes propagation', () => {
        it(
            'adding permission to parent should immediately affect inheriting children',
        );
        it(
            'removing permission from parent should immediately affect inheriting children',
        );
        it('changes to parent should not affect unsynced children');
    });
});
```

---

### Category 2: API Tests - Space Operations

**File: `packages/e2e/cypress/e2e/api/nestedSpaceOperations.cy.ts`**

#### 2.1 Space CRUD with Inheritance

```typescript
describe('Space CRUD with Inheritance', () => {
    describe('Create space', () => {
        it(
            'should create root space with inheritParentPermissions based on isPrivate',
        );
        it(
            'should create nested space with inheritParentPermissions=true by default',
        );
        it(
            'should create nested space with explicit inheritParentPermissions=false',
        );
        it('should validate parentSpaceUuid exists in same project');
    });

    describe('Update space', () => {
        it('should toggle inheritParentPermissions from true to false');
        it('should toggle inheritParentPermissions from false to true');
        it('should not allow changing isPrivate for nested spaces');
        it('should copy permissions when breaking inheritance');
    });

    describe('Delete space', () => {
        it('should cascade delete to nested spaces');
        it('should get delete impact showing all affected spaces');
        it(
            'should show restricted space names in delete impact even without access',
        );
    });
});
```

#### 2.2 Move Operations

```typescript
describe('Move Space Operations', () => {
    it('should move space to different parent');
    it('should move space to root level');
    it('should recalculate effective permissions after move');
    it('should require appropriate permissions on both source and target');
});
```

#### 2.3 Space Access Management

```typescript
describe('Space Access Management', () => {
    describe('Add access', () => {
        it('should add user access to space');
        it('should add group access to space');
        it('should not duplicate existing access');
    });

    describe('Remove access', () => {
        it('should remove user access from space');
        it('should remove group access from space');
        it('should not remove inherited access (only direct)');
    });

    describe('Clear all access', () => {
        it('should clear all direct user and group access');
        it('should leave inherited permissions intact');
    });
});
```

---

### Category 3: API Tests - Breadcrumbs & Navigation

**File: `packages/e2e/cypress/e2e/api/nestedSpaceBreadcrumbs.cy.ts`**

```typescript
describe('Breadcrumb Access Information', () => {
    it('should include breadcrumbs with access info for each ancestor');
    it('should show hasAccess=true for accessible ancestors');
    it('should show hasAccess=false for inaccessible ancestors');
    it('should always show space names in breadcrumbs regardless of access');
    it('should compute breadcrumb access correctly with inheritance chain');
});
```

---

### Category 4: API Tests - Search & Content APIs

**File: `packages/e2e/cypress/e2e/api/nestedSpaceSearch.cy.ts`**

```typescript
describe('Search with Nested Permissions', () => {
    describe('Space search', () => {
        it('should return spaces with inherited access in search results');
        it('should not return unsynced spaces without direct access');
        it('should return nested spaces matching search query');
    });

    describe('Content search', () => {
        it('should return charts/dashboards in spaces with inherited access');
        it('should not return content in spaces without access');
    });

    describe('Content API', () => {
        it('v2 content endpoint respects nested space permissions');
        it('charts list excludes content in inaccessible nested spaces');
        it('dashboards list excludes content in inaccessible nested spaces');
    });
});
```

---

### Category 5: UI Tests - Space Settings & Permissions

**File: `packages/e2e/cypress/e2e/app/nestedSpacePermissions.cy.ts`**

```typescript
describe('Nested Space Permissions UI', () => {
    describe('Space settings panel', () => {
        it('should show inheritance toggle for nested spaces');
        it('should hide inheritance toggle for root spaces');
        it('should show effective permissions list');
        it('should distinguish inherited vs direct permissions in UI');
        it('should show confirmation when breaking inheritance');
    });

    describe('Adding permissions', () => {
        it('should allow adding user to inheriting space');
        it('should allow adding group to inheriting space');
        it('should show newly added permission as direct');
    });

    describe('Breaking inheritance', () => {
        it('should show warning about copying permissions');
        it('should update permissions list after breaking');
        it('should show all previously inherited as now direct');
    });
});
```

---

### Category 6: UI Tests - Navigation & Visibility

**File: `packages/e2e/cypress/e2e/app/nestedSpaceNavigation.cy.ts`**

```typescript
describe('Nested Space Navigation', () => {
    describe('Space browser', () => {
        it('should show nested spaces user has access to');
        it('should hide nested spaces user cannot access');
        it('should show parent spaces even when child is unsynced');
    });

    describe('Breadcrumb navigation', () => {
        it('should show all ancestor names in breadcrumbs');
        it('should indicate inaccessible ancestors visually');
        it('should allow clicking accessible ancestors');
        it('should disable click on inaccessible ancestors');
    });

    describe('Space tree in modals', () => {
        it('should show accessible nested spaces in save location picker');
        it('should show accessible nested spaces in move dialog');
        it('should hide inaccessible spaces in tree');
    });
});
```

---

### Category 7: UI Tests - Delete Flow

**File: `packages/e2e/cypress/e2e/app/nestedSpaceDelete.cy.ts`**

```typescript
describe('Nested Space Delete Flow', () => {
    describe('Delete impact preview', () => {
        it('should show all affected child spaces in delete dialog');
        it('should show names of restricted child spaces');
        it('should show content counts for each affected space');
        it('should indicate which spaces user has access to');
    });

    describe('Cascade delete', () => {
        it('should delete parent and all children on confirm');
        it(
            'should work even when children have different inheritance settings',
        );
    });
});
```

---

### Category 8: Role-Based Access Tests

**File: `packages/e2e/cypress/e2e/api/nestedSpaceRoles.cy.ts`**

```typescript
describe('Role-Based Nested Space Access', () => {
    describe('Admin role', () => {
        it('can see all spaces regardless of inheritance');
        it('can manage all spaces');
        it('can toggle inheritance on any space');
        it('can delete parent with inaccessible children');
    });

    describe('Editor role', () => {
        it('can see public spaces and inherited access');
        it('can create nested spaces in accessible parents');
        it('can manage spaces with EDITOR+ role');
        it('cannot see private unsynced spaces without access');
    });

    describe('Viewer role', () => {
        it('can see public spaces and directly shared spaces');
        it('cannot create spaces');
        it('cannot modify space permissions');
        it('can view content in spaces with inherited access');
    });

    describe('Interactive Viewer role', () => {
        it('has same visibility as viewer for spaces');
        it('can manage spaces where they have EDITOR/ADMIN role');
    });
});
```

---

## Test Implementation Order

### Phase 1: Core Permission Logic (API Tests)

1. `nestedSpacePermissions.cy.ts` - Basic inheritance behavior
2. `nestedSpaceOperations.cy.ts` - CRUD operations

### Phase 2: Access Control (API Tests)

3. `nestedSpaceRoles.cy.ts` - Role-based access
4. `nestedSpaceSearch.cy.ts` - Search and content APIs

### Phase 3: UI Flows

5. `nestedSpaceNavigation.cy.ts` - Navigation and visibility
6. `nestedSpacePermissions.cy.ts` (UI) - Settings panel
7. `nestedSpaceDelete.cy.ts` - Delete flow

### Phase 4: Edge Cases

8. `nestedSpaceBreadcrumbs.cy.ts` - Breadcrumb access info
9. Additional edge case tests in existing files

---

## Test Data Setup Approach

### Option A: Use Existing Seeds + Dynamic Creation

- Use existing SPACE_TREE_1/2 for basic tests
- Create additional spaces dynamically in test setup
- Clean up after tests

### Option B: Add New Seed Data

- Add `06_inheritance_test_spaces.ts` seed file
- Create dedicated spaces for inheritance testing
- More reliable but requires migration on test env

**Recommendation**: Start with Option A for flexibility, migrate to Option B for stable CI.

---

## Helper Functions Needed

```typescript
// cypress/support/spaceUtils.ts

// Create nested space with specific inheritance settings
function createNestedSpace(opts: {
    projectUuid: string;
    parentSpaceUuid: string;
    name: string;
    inheritParentPermissions?: boolean;
}): Chainable<Space>;

// Toggle inheritance and verify permission copy
function toggleInheritance(
    spaceUuid: string,
    inherit: boolean,
): Chainable<Space>;

// Verify effective permissions match expected
function verifyEffectivePermissions(
    spaceUuid: string,
    expected: Array<{ userUuid: string; role: SpaceRole; isDirect: boolean }>,
): Chainable<void>;

// Get space with full permission details
function getSpaceWithPermissions(spaceUuid: string): Chainable<Space>;

// Verify user can/cannot access space
function verifySpaceAccess(
    spaceUuid: string,
    userEmail: string,
    expectedAccess: boolean,
): Chainable<void>;
```

---

## Feature Flag Considerations

The `NestedSpacesPermissions` feature flag controls whether inheritance is active. Tests should:

1. **Assume feature flag is ON** for all nested permission tests
2. Optionally test backward compatibility with flag OFF
3. Document any flag-dependent behavior in test descriptions

---

## Metrics to Track

1. Test coverage of permission combinations
2. Test runtime for permission-heavy tests
3. Flakiness rate for UI permission tests

---

## Known Issues / TODOs

1. [ ] Feature flag must be enabled for tests to pass
2. [ ] Seed data may need updates for inheritance scenarios
3. [ ] Some UI elements may not exist yet (permission toggle)
4. [ ] Performance tests for deep nesting TBD
