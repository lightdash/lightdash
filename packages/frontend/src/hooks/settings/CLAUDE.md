<summary>
Single source for the settings sidebar navigation model. `useSettingsNavSections` gathers the current user's abilities, organization/project, and feature flags, then assembles the gated, grouped list of sidebar entries (`navSections`) that the settings page renders. Each entry carries `keywords` so a future global search can match aliases.
</summary>

<howToUse>
The sidebar nav is data, not JSX. To add or edit a sidebar entry, edit the `navSections` builder in `useSettingsNavSections.ts` — do NOT hand-write `RouterNavLink`s.

- Entry shape is `SettingsNavItem` (`types.ts`): `label`, `to`, `icon`, `keywords`, `children`, optional `exact`, optional `onClick`.
- Entries are pushed into one of three sections (`your-settings`, `organization`, `current-project`) in display order — position your `push` where you want it to appear.
- Gating is the `if` guarding each `push`: combine `ability?.can(...)` (CASL, with `subject(...)` for scoped checks) and the resolved feature-flag booleans already computed at the top of the hook. Only permitted entries are added, so rendering stays a dumb map.
- Leaf entries set `exact: true`. A parent with `children` omits `exact` (partial match) so it stays active on its child routes; nested children render expanded when the path matches (`defaultOpened` in `SettingsNavList`).
- `keywords` are hidden search aliases — add the synonyms a user might type (e.g. `Single Sign-On` → `['sso','saml','okta']`). They don't affect rendering today.

`SettingsNavList.tsx` renders whatever `navSections` contains; you rarely need to touch it.
</howToUse>

<codeExample>

```typescript
// In useSettingsNavSections.ts, inside the navSections useMemo:
if (ability?.can('manage', 'Organization') && isMyFeatureEnabled) {
    organizationItems.push({
        label: 'My new setting',
        to: '/generalSettings/myNewSetting',
        icon: IconSparkles,
        keywords: ['alias', 'synonym'],
        children: [],
        exact: true,
    });
}

// Resolve the flag near the other flags at the top of the hook:
const { data: myFeatureFlag } = useServerFeatureFlag(FeatureFlags.MyFeature);
const isMyFeatureEnabled = myFeatureFlag?.enabled ?? false;
```

</codeExample>

<importantToKnow>
- **The sidebar and the router are NOT unified yet.** A nav entry only adds the sidebar link. To make the page reachable you must ALSO add a matching route:
  - Org/user-level pages → the `routes` `useMemo` in `@/packages/frontend/src/pages/Settings.tsx`.
  - `current-project` pages (`to` under `/projectManagement/${projectUuid}/...`) → routes live in `@/packages/frontend/src/pages/ProjectSettings.tsx`, not in `Settings.tsx`.
  Keep the entry's gating in sync with the route's gating, or you get a nav link to a forbidden/missing route, or a reachable route with no nav link. (Unifying both into one registry is the remaining part of SPK-469.)
- The hook also returns the gating context + loading/error that `Settings.tsx` consumes for its `routes` memo and render guards — if a route needs a flag the hook doesn't return yet, add it to the return object.
- `navSections` is computed in a `useMemo` that runs before the page's `!user` guard, so it uses `user?.ability` (optional). It's only consumed after the guard, so transient empty sections are harmless — keep the optional chaining.
- Changing a `label` here is purely cosmetic; changing a `to` requires updating the corresponding route path too.
</importantToKnow>

<links>
- Nav model + assembly: @/packages/frontend/src/hooks/settings/useSettingsNavSections.ts
- Entry/section types: @/packages/frontend/src/hooks/settings/types.ts
- Renderer: @/packages/frontend/src/pages/SettingsNavList.tsx
- Router + org/user routes: @/packages/frontend/src/pages/Settings.tsx
- Project-level routes: @/packages/frontend/src/pages/ProjectSettings.tsx
- Permissions/abilities: @/packages/common/src/authorization/
</links>
