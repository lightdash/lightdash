# @lightdash/learn-ui

The Learn board and lesson UI shared by the in-app Learn section and learn.lightdash.com. It renders the role/scope board, ask bar, lesson player and role badges from a catalogue of modules and lessons, and adapts to whichever host supplies its scope registry.

## Install

```
pnpm add @lightdash/learn-ui
```

Peer dependencies (install alongside): `react` and `react-dom` (`^18.x || ^19.x`), `@mantine/core` and `@mantine/hooks` (`^8.3.18`).

## The ScopeSource contract

The package doesn't know how to look up scopes itself. Each host adapts its own scope registry to this interface and passes it in:

```ts
export interface ScopeSource {
    getAllScopeMap(opts: { isEnterprise: boolean }): Record<string, Scope>;
    getAllScopesForRole(role: ProjectMemberRole): string[];
}
```

In-app, the host adapts `@lightdash/common`'s `getAllScopeMap`/`getAllScopesForRole`. On learn.lightdash.com, the host adapts its bundled `scope-manifest.json`.

## Wiring it up

Wrap your tree in `LearnUiProvider` with a `ScopeSource`, then read the model with `useLearnModel()`:

```tsx
import { LearnUiProvider, useLearnModel } from '@lightdash/learn-ui';

<LearnUiProvider scopeSource={myScopeSource}>
    <App />
</LearnUiProvider>;

const { groupOf, isUnlocked, heldBy } = useLearnModel();
```

`useScopeSource()` is also exported if you need the raw `ScopeSource` rather than the derived model.

## Styling

Components read their accent colour from the `--learn-accent` CSS custom property, falling back to `#7262FF` if the host doesn't set it. Set it on an ancestor element to theme the board:

```css
:root {
    --learn-accent: #7262ff;
}
```

CSS modules ship inside `dist` alongside their compiled components (`tsc` only emits JS and declarations, so a build step copies the `.module.css` files across). Consuming this package requires a bundler that resolves `.module.css` imports itself, such as Vite or esbuild. There is no precompiled, plain-CSS output.

## Exports

Components: `AskBar`, `BoardNode`, `BoardRail`, `ClusterBoard`, `LearnDemo`, `LessonBody`, `ModulePane`, `RoleBadgeCard`, `RoleTabs`.

Also exported: the scope types (`Scope`, `ScopeSource`, `ScopeGroup`, `ProjectMemberRole`, `OrganizationMemberRole`), the board/lesson/catalogue types, and the model helpers (`createLearnModel`, rollup helpers, and friends) that back the components above.
