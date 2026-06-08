<summary>
Single source for the settings sidebar navigation. `useSettingsContext` gathers the gating inputs (the user's abilities, organization/project, resolved feature flags, loading/error). `useSettingsNavigation` derives the gated, grouped list of sidebar entries (`SettingsNavigationSection[]`) from that context. Each entry carries `keywords` so a future global search can match aliases.
</summary>

<howToUse>
The sidebar nav is data, not JSX. To add or edit a sidebar entry, edit the builder in `useSettingsNavigation.ts` — do NOT hand-write `RouterNavLink`s.

- Entry shape is `SettingsNavigationItem` (`types.ts`): `label`, `to`, `icon`, `keywords`, `children`, optional `exact`, optional `onClick`.
- Entries are pushed into one of three sections (`your-settings`, `organization`, `current-project`) in display order — position your `push` where you want it to appear.
- Gating is the `if` guarding each `push`: combine `ability?.can(...)` (CASL, with `subject(...)` for scoped checks) and the resolved feature-flag booleans destructured from `useSettingsContext()`. Only permitted entries are added, so rendering stays a dumb map.
- Leaf entries set `exact: true`. A parent with `children` omits `exact` (partial match) so it stays active on its child routes; nested children render expanded when the path matches (`defaultOpened` in `SettingsNavigation`).
- `keywords` are hidden search aliases — add the synonyms a user might type (e.g. `Single Sign-On` → `['sso','saml','okta']`). They don't affect rendering today.

If your entry needs a new feature flag, resolve it in `useSettingsContext.ts` and add it to the `SettingsContext` type, then destructure it in `useSettingsNavigation`. `SettingsNavigation.tsx` renders whatever sections it's given; you rarely need to touch it.
</howToUse>

<codeExample>

```typescript
// In useSettingsContext.ts — resolve the flag and expose it on SettingsContext:
const { data: myFeatureFlag } = useServerFeatureFlag(FeatureFlags.MyFeature);
const isMyFeatureEnabled = myFeatureFlag?.enabled ?? false;
// ...return { ...rest, isMyFeatureEnabled };  (add isMyFeatureEnabled to SettingsContext in types.ts)

// In useSettingsNavigation.ts — destructure it, then push the entry in display order:
const { isMyFeatureEnabled /* , ... */ } = useSettingsContext();
if (isMyFeatureEnabled && ability?.can('manage', 'Organization')) {
    organizationItems.push({
        label: 'My new setting',
        to: '/generalSettings/myNewSetting',
        icon: IconSparkles,
        keywords: ['alias', 'synonym'],
        children: [],
        exact: true,
    });
}
```

</codeExample>

<importantToKnow>
- **The sidebar and the router are NOT unified yet.** A nav entry only adds the sidebar link. To make the page reachable you must ALSO add a matching route:
  - Org/user-level pages → the `routes` `useMemo` in `@/packages/frontend/src/pages/Settings.tsx`.
  - `current-project` pages (`to` under `/projectManagement/${projectUuid}/...`) → routes live in `@/packages/frontend/src/pages/ProjectSettings.tsx`, not in `Settings.tsx`.
  Keep the entry's gating in sync with the route's gating, or you get a nav link to a forbidden/missing route, or a reachable route with no nav link. (Unifying both into one registry is the remaining part of SPK-469.)
- `useSettingsContext` is the shared primitive: `Settings.tsx` reads it for its `routes` memo and render guards, and `useSettingsNavigation` reads it for the nav. If a route needs a flag the context doesn't expose yet, add it to `SettingsContext` and return it from `useSettingsContext`.
- The nav model is built in a `useMemo` that runs before the page's `!user` guard, so it uses `user?.ability` (optional). It's only consumed after the guard, so transient empty sections are harmless — keep the optional chaining.
- Changing a `label` here is purely cosmetic; changing a `to` requires updating the corresponding route path too.
</importantToKnow>

<links>
- Gating context: @/packages/frontend/src/hooks/settings/useSettingsContext.ts
- Nav model assembly: @/packages/frontend/src/hooks/settings/useSettingsNavigation.ts
- Entry/section + context types: @/packages/frontend/src/hooks/settings/types.ts
- Renderer: @/packages/frontend/src/pages/SettingsNavigation.tsx
- Router + org/user routes: @/packages/frontend/src/pages/Settings.tsx
- Project-level routes: @/packages/frontend/src/pages/ProjectSettings.tsx
- Permissions/abilities: @/packages/common/src/authorization/
</links>
