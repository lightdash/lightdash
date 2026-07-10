# Dependency Status Scope Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the custom-role dependency counts single-select toggle filters and restore the “Role type” copy.

**Architecture:** Centralize dependency classification in `scopeUtils.ts`, then reuse it for counts and grouped-scope filtering so their semantics cannot drift. `RoleBuilder` owns the optional active status because it renders the footer controls, while `ScopeSelector` composes that status with its existing debounced text search.

**Tech Stack:** React 19, TypeScript, Mantine 8, CSS Modules, Vitest, pnpm.

## Global Constraints

- At most one of `full`, `partial`, and `empty` is active.
- Clicking the active status clears it; clicking another status switches it.
- Text search and dependency status use AND semantics.
- Counts remain unfiltered totals for the current Role Type.
- The active dependency filter persists when Role Type changes.
- Filtering changes presentation only and never mutates role selections.
- Permissions without dependencies are `full`.
- Both the editable heading and locked-role hint use “Role type,” not “Role scope.”

---

### Task 1: Centralize and test dependency-status filtering

**Files:**
- Modify: `packages/frontend/src/ee/features/customRoles/utils/scopeUtils.ts:25-205`
- Test: `packages/frontend/src/ee/features/customRoles/utils/scopeUtils.test.ts:1-95`

**Interfaces:**
- Consumes: `GroupedScopes`, `DependencyStatus`, `getScopeDependencies(scopeName)`.
- Produces: `getScopeDependencyStatus(scopeName: string, scopes: Record<string, boolean>): DependencyStatus` and `filterScopesByDependencyStatus(groupedScopes: GroupedScopes[], scopes: Record<string, boolean>, status?: DependencyStatus): GroupedScopes[]`.

- [ ] **Step 1: Write failing classification and filtering tests**

Import the new helpers, then add:

```ts
describe('getScopeDependencyStatus', () => {
    it('classifies all, some, no, and dependency-free scopes', () => {
        expect(getScopeDependencyStatus('manage:Dashboard', {
            'view:Project': true,
            'view:SavedChart': true,
            'view:Space': true,
        })).toBe('full');
        expect(getScopeDependencyStatus('manage:Dashboard', {
            'view:Project': true,
        })).toBe('partial');
        expect(getScopeDependencyStatus('manage:Dashboard', {})).toBe('empty');
        expect(getScopeDependencyStatus('view:Project', {})).toBe('full');
    });
});

describe('filterScopesByDependencyStatus', () => {
    const groupedScopes = getScopesByGroup(true, 'project');

    it('returns only selected scopes matching the status', () => {
        const filtered = filterScopesByDependencyStatus(groupedScopes, {
            'manage:Dashboard': true,
            'create:Job': true,
            'view:Project': true,
        }, 'partial');

        expect(filtered.flatMap((group) =>
            group.scopes.map(({ name }) => name),
        )).toEqual(['manage:Dashboard', 'create:Job']);
    });

    it('drops empty groups and is a no-op without a status', () => {
        const scopes = { 'view:Project': true };
        expect(filterScopesByDependencyStatus(
            groupedScopes,
            scopes,
            'empty',
        )).toEqual([]);
        expect(filterScopesByDependencyStatus(groupedScopes, scopes))
            .toBe(groupedScopes);
    });
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
pnpm -F frontend test --run src/ee/features/customRoles/utils/scopeUtils.test.ts
```

Expected: FAIL because the two helpers are not exported.

- [ ] **Step 3: Add the shared classifier and filter**

Add after `getScopeNamesWithDependencies`:

```ts
export const getScopeDependencyStatus = (
    scopeName: string,
    scopes: Record<string, boolean>,
): DependencyStatus => {
    const dependencies = getScopeDependencies(scopeName);
    const selectedDependencyCount = dependencies.filter(
        (dependency) => scopes[dependency.name],
    ).length;

    if (
        dependencies.length === 0 ||
        selectedDependencyCount === dependencies.length
    ) {
        return 'full';
    }

    return selectedDependencyCount === 0 ? 'empty' : 'partial';
};
```

Refactor the count reducer to increment the returned status, then add before `filterScopes`:

```ts
export const filterScopesByDependencyStatus = (
    groupedScopes: GroupedScopes[],
    scopes: Record<string, boolean>,
    status?: DependencyStatus,
): GroupedScopes[] => {
    if (!status) {
        return groupedScopes;
    }

    return groupedScopes
        .map((group) => ({
            ...group,
            scopes: group.scopes.filter(
                (scope) =>
                    scopes[scope.name] &&
                    getScopeDependencyStatus(scope.name, scopes) === status,
            ),
        }))
        .filter((group) => group.scopes.length > 0);
};
```

- [ ] **Step 4: Run focused tests and verify they pass**

Run the command from Step 2. Expected: PASS for dependency traversal, classification, counts, and filtering.

- [ ] **Step 5: Commit the tested utility slice**

```bash
git add packages/frontend/src/ee/features/customRoles/utils/scopeUtils.ts packages/frontend/src/ee/features/customRoles/utils/scopeUtils.test.ts
git commit -m "feat: filter role scopes by dependency status"
```

---

### Task 2: Wire accessible single-select footer controls into the scope list

**Files:**
- Modify: `packages/frontend/src/ee/features/customRoles/components/RoleBuilder/RoleBuilder.tsx:1-342`
- Modify: `packages/frontend/src/ee/features/customRoles/components/RoleBuilder/RoleBuilder.module.css:115-139`
- Modify: `packages/frontend/src/ee/features/customRoles/components/ScopeSelector/ScopeSelector.tsx:30-415`

**Interfaces:**
- Consumes: `DependencyStatus`, `filterScopesByDependencyStatus`, `RoleFormValues.scopes`, and `dependencyStatusItems`.
- Produces: `ScopeSelectorProps.dependencyStatus?: DependencyStatus` and footer toggle controls with `aria-pressed`.

- [ ] **Step 1: Compose status filtering with text search**

Import `filterScopesByDependencyStatus` and `DependencyStatus`, extend `ScopeSelectorProps`, and derive:

```ts
const dependencyFilteredScopes = useMemo(
    () =>
        filterScopesByDependencyStatus(
            allGroupedScopes,
            form.values.scopes || {},
            dependencyStatus,
        ),
    [allGroupedScopes, dependencyStatus, form.values.scopes],
);

const filteredScopes = useMemo(
    () => filterScopes(dependencyFilteredScopes, debouncedSearchTerm),
    [dependencyFilteredScopes, debouncedSearchTerm],
);
```

Keep totals, selected counts, Select all, and Clear all based on `allGroupedScopes`.

- [ ] **Step 2: Add single-select state and footer controls**

In `RoleBuilder`, import `useState`, add:

```ts
const [dependencyStatus, setDependencyStatus] = useState<DependencyStatus>();

const handleDependencyStatusClick = (status: DependencyStatus) => {
    setDependencyStatus((current) =>
        current === status ? undefined : status,
    );
};
```

Pass `dependencyStatus` into `ScopeSelector`. Replace each static footer group with:

```tsx
<UnstyledButton
    key={status.key}
    className={styles.dependencyStatusButton}
    data-selected={isSelected}
    aria-label={`Show ${count} permissions with ${status.key} dependencies`}
    aria-pressed={isSelected}
    onClick={() => handleDependencyStatusClick(status.key)}
>
    <Group gap={4}>
        <MantineIcon
            icon={status.icon}
            size={13}
            color={status.color}
        />
        <Text fz="sm" c="dimmed">{count}</Text>
    </Group>
</UnstyledButton>
```

Do not clear the state in `handleLevelChange`, so it persists across Role Type changes.

- [ ] **Step 3: Style hover, focus, and selected states**

Add:

```css
.dependencyStatusButton {
    padding: 2px 4px;
    border-radius: var(--mantine-radius-sm);
}

.dependencyStatusButton:hover,
.dependencyStatusButton:focus-visible,
.dependencyStatusButton[data-selected='true'] {
    background-color: var(--mantine-color-ldGray-1);

    @mixin dark {
        background-color: var(--mantine-color-ldDark-5);
    }
}

.dependencyStatusButton:focus-visible {
    outline: 2px solid var(--mantine-color-blue-outline);
    outline-offset: 1px;
}
```

- [ ] **Step 4: Restore the Role Type copy**

Change the edit hint to `"Role type can't be changed after creation."` and the label to `<Input.Label>Role type</Input.Label>`.

- [ ] **Step 5: Run static verification**

```bash
pnpm -F frontend typecheck:fast
pnpm -F frontend lint
pnpm -F frontend format
```

Expected: all commands exit 0.

- [ ] **Step 6: Verify the UI manually**

Use the `berlin` URL from `./scripts/dev-ports.sh show` and verify single-select activate/switch/clear, AND search, all statuses, zero results, Role Type persistence, unchanged totals/selections, keyboard focus, `aria-pressed`, and restored copy. Capture matching before/after screenshots in the ld-dev artifact folder.

- [ ] **Step 7: Commit the UI slice**

```bash
git add packages/frontend/src/ee/features/customRoles/components/RoleBuilder/RoleBuilder.tsx packages/frontend/src/ee/features/customRoles/components/RoleBuilder/RoleBuilder.module.css packages/frontend/src/ee/features/customRoles/components/ScopeSelector/ScopeSelector.tsx
git commit -m "feat: toggle dependency status filters"
```

---

### Task 3: Final regression verification

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: the completed utility and UI slices.
- Produces: green focused tests, frontend static checks, and runtime evidence.

- [ ] **Step 1: Run the focused unit suite**

```bash
pnpm -F frontend test --run src/ee/features/customRoles/utils/scopeUtils.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run frontend static checks**

```bash
pnpm -F frontend typecheck:fast
pnpm -F frontend lint
pnpm -F frontend format
```

Expected: all commands exit 0.

- [ ] **Step 3: Check the final diff**

```bash
git diff main...HEAD --check
git status --short
```

Expected: no whitespace errors and no uncommitted files.
