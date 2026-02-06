# Biome Migration Plan: ESLint to Biome

This document outlines the plan for migrating Lightdash from ESLint + Prettier to Biome.

## Executive Summary

| Metric | ESLint | Biome |
|--------|--------|-------|
| Linting 10k files | ~45s | ~0.8s |
| Formatting 10k files | ~12s (Prettier) | ~0.3s |
| Config complexity | 7 .eslintrc files | 1 biome.json |
| Dependencies to remove | ~25 packages | - |

## Current ESLint Configuration Overview

### Packages with ESLint configs:
- Root (`.eslintrc.js`)
- `packages/backend/.eslintrc.js`
- `packages/frontend/.eslintrc.js`
- `packages/common/.eslintrc.js`
- `packages/cli/.eslintrc.js`
- `packages/warehouses/.eslintrc.js`
- `packages/e2e/.eslintrc.js`

### Currently Used ESLint Plugins:
- `@typescript-eslint/eslint-plugin`
- `eslint-config-airbnb` / `eslint-config-airbnb-base` / `eslint-config-airbnb-typescript`
- `eslint-config-prettier`
- `eslint-plugin-import`
- `eslint-plugin-json`
- `eslint-plugin-jsdoc` (backend only)
- `eslint-plugin-react`
- `eslint-plugin-react-hooks`
- `eslint-plugin-jsx-a11y`
- `eslint-plugin-css-modules`
- `eslint-plugin-react-refresh`
- `eslint-plugin-jest`
- `eslint-plugin-jest-dom`
- `eslint-plugin-testing-library`
- `eslint-plugin-storybook`
- `eslint-plugin-lodash`

---

## Rule Mapping: ESLint → Biome

### Critical Rules (Must Have)

| ESLint Rule | Biome Equivalent | Status |
|-------------|------------------|--------|
| `@typescript-eslint/no-floating-promises` | `noFloatingPromises` (nursery) | ✅ Available |
| `@typescript-eslint/no-explicit-any` | `noExplicitAny` | ✅ Available |
| `eqeqeq` | `noDoubleEquals` | ✅ Available |
| `no-console` | `noConsole` | ✅ Available |
| `no-unused-vars` / `@typescript-eslint/no-unused-vars` | `noUnusedVariables` | ✅ Available |
| `@typescript-eslint/consistent-type-imports` | `useImportType` | ✅ Available (inspired) |
| `react-hooks/exhaustive-deps` | `useExhaustiveDependencies` | ✅ Available (inspired) |
| `react-hooks/rules-of-hooks` | `useHookAtTopLevel` | ✅ Available |

### TypeScript-ESLint Rules

| ESLint Rule | Biome Equivalent | Status |
|-------------|------------------|--------|
| `@typescript-eslint/adjacent-overload-signatures` | `useAdjacentOverloadSignatures` | ✅ |
| `@typescript-eslint/array-type` | `useConsistentArrayType` | ✅ |
| `@typescript-eslint/ban-types` | `noBannedTypes` | ✅ (inspired) |
| `@typescript-eslint/consistent-type-exports` | `useExportType` | ✅ (inspired) |
| `@typescript-eslint/naming-convention` | `useNamingConvention` | ✅ (inspired) |
| `@typescript-eslint/no-empty-interface` | `noEmptyInterface` | ✅ (inspired) |
| `@typescript-eslint/no-extra-non-null-assertion` | `noExtraNonNullAssertion` | ✅ |
| `@typescript-eslint/no-inferrable-types` | `noInferrableTypes` | ✅ |
| `@typescript-eslint/no-invalid-void-type` | `noConfusingVoidType` | ✅ |
| `@typescript-eslint/no-misused-new` | `noMisleadingInstantiator` | ✅ |
| `@typescript-eslint/no-namespace` | `noNamespace` | ✅ |
| `@typescript-eslint/no-non-null-assertion` | `noNonNullAssertion` | ✅ |
| `@typescript-eslint/no-unsafe-declaration-merging` | `noUnsafeDeclarationMerging` | ✅ |
| `@typescript-eslint/prefer-as-const` | `useAsConstAssertion` | ✅ |
| `@typescript-eslint/prefer-enum-initializers` | `useEnumInitializers` | ✅ |
| `@typescript-eslint/prefer-function-type` | `useShorthandFunctionType` | ✅ |
| `@typescript-eslint/prefer-literal-enum-member` | `useLiteralEnumMembers` | ✅ |
| `@typescript-eslint/prefer-namespace-keyword` | `useNamespaceKeyword` | ✅ |
| `@typescript-eslint/prefer-optional-chain` | `useOptionalChain` | ✅ |
| `@typescript-eslint/no-unsafe-member-access` | - | ⚠️ No equivalent |
| `@typescript-eslint/no-unsafe-assignment` | - | ⚠️ No equivalent |
| `@typescript-eslint/no-unsafe-call` | - | ⚠️ No equivalent |
| `@typescript-eslint/no-throw-literal` | `useThrowOnlyError` | ✅ |

### React Rules

| ESLint Rule | Biome Equivalent | Status |
|-------------|------------------|--------|
| `react/button-has-type` | `useButtonType` | ✅ |
| `react/jsx-boolean-value` | `noImplicitBoolean` | ✅ (inspired) |
| `react/jsx-curly-brace-presence` | `useConsistentCurlyBraces` | ✅ (inspired) |
| `react/jsx-fragments` | `useFragmentSyntax` | ✅ |
| `react/jsx-key` | `useJsxKeyInIterable` | ✅ |
| `react/jsx-no-comment-textnodes` | `noCommentText` | ✅ |
| `react/jsx-no-duplicate-props` | `noDuplicateJsxProps` | ✅ |
| `react/jsx-no-target-blank` | `noBlankTarget` | ✅ |
| `react/jsx-no-useless-fragment` | `noUselessFragments` | ✅ |
| `react/no-array-index-key` | `noArrayIndexKey` | ✅ (inspired) |
| `react/no-children-prop` | `noChildrenProp` | ✅ |
| `react/no-danger` | `noDangerouslySetInnerHtml` | ✅ |
| `react/no-danger-with-children` | `noDangerouslySetInnerHtmlWithChildren` | ✅ |
| `react/void-dom-elements-no-children` | `noVoidElementsWithChildren` | ✅ |
| `react/prop-types` | - | N/A (disabled in codebase) |
| `react-refresh/only-export-components` | - | ⚠️ No equivalent |

### JSX A11y Rules

| ESLint Rule | Biome Equivalent | Status |
|-------------|------------------|--------|
| `jsx-a11y/alt-text` | `useAltText` | ✅ |
| `jsx-a11y/anchor-has-content` | `useAnchorContent` | ✅ |
| `jsx-a11y/anchor-is-valid` | `useValidAnchor` | ✅ |
| `jsx-a11y/aria-activedescendant-has-tabindex` | `useAriaActivedescendantWithTabindex` | ✅ |
| `jsx-a11y/aria-props` | `useValidAriaProps` | ✅ |
| `jsx-a11y/aria-proptypes` | `useValidAriaValues` | ✅ |
| `jsx-a11y/aria-role` | `useValidAriaRole` | ✅ |
| `jsx-a11y/aria-unsupported-elements` | `noAriaUnsupportedElements` | ✅ |
| `jsx-a11y/autocomplete-valid` | `useValidAutocomplete` | ✅ |
| `jsx-a11y/click-events-have-key-events` | `useKeyWithClickEvents` | ✅ |
| `jsx-a11y/heading-has-content` | `useHeadingContent` | ✅ |
| `jsx-a11y/html-has-lang` | `useHtmlLang` | ✅ |
| `jsx-a11y/iframe-has-title` | `useIframeTitle` | ✅ |
| `jsx-a11y/img-redundant-alt` | `noRedundantAlt` | ✅ |
| `jsx-a11y/interactive-supports-focus` | `useFocusableInteractive` | ✅ |
| `jsx-a11y/label-has-associated-control` | `noLabelWithoutControl` | ✅ |
| `jsx-a11y/lang` | `useValidLang` | ✅ |
| `jsx-a11y/media-has-caption` | `useMediaCaption` | ✅ |
| `jsx-a11y/mouse-events-have-key-events` | `useKeyWithMouseEvents` | ✅ |
| `jsx-a11y/no-access-key` | `noAccessKey` | ✅ (inspired) |
| `jsx-a11y/no-aria-hidden-on-focusable` | `noAriaHiddenOnFocusable` | ✅ |
| `jsx-a11y/no-autofocus` | `noAutofocus` | ✅ |
| `jsx-a11y/no-distracting-elements` | `noDistractingElements` | ✅ |
| `jsx-a11y/no-interactive-element-to-noninteractive-role` | `noInteractiveElementToNoninteractiveRole` | ✅ |
| `jsx-a11y/no-noninteractive-element-to-interactive-role` | `noNoninteractiveElementToInteractiveRole` | ✅ |
| `jsx-a11y/no-noninteractive-tabindex` | `noNoninteractiveTabindex` | ✅ |
| `jsx-a11y/no-redundant-roles` | `noRedundantRoles` | ✅ |
| `jsx-a11y/no-static-element-interactions` | `noStaticElementInteractions` | ✅ |
| `jsx-a11y/prefer-tag-over-role` | `useSemanticElements` | ✅ |
| `jsx-a11y/role-has-required-aria-props` | `useAriaPropsForRole` | ✅ |
| `jsx-a11y/role-supports-aria-props` | `useAriaPropsSupportedByRole` | ✅ |
| `jsx-a11y/scope` | `noHeaderScope` | ✅ |
| `jsx-a11y/tabindex-no-positive` | `noPositiveTabindex` | ✅ |

### Import Rules

| ESLint Rule | Biome Equivalent | Status |
|-------------|------------------|--------|
| `import/no-commonjs` | `noCommonJs` | ✅ (inspired) |
| `import/no-default-export` | `noDefaultExport` | ✅ |
| `import/no-extraneous-dependencies` | `noUndeclaredDependencies` | ✅ |
| `import/no-nodejs-modules` | `noNodejsModules` | ✅ |
| `import/prefer-default-export` | - | N/A (disabled in codebase) |
| `import/order` | Biome formatter handles import sorting | ✅ |

### Testing Rules

| ESLint Rule | Biome Equivalent | Status |
|-------------|------------------|--------|
| `jest-dom/prefer-checked` | - | ⚠️ No equivalent |
| `jest-dom/prefer-enabled-disabled` | - | ⚠️ No equivalent |
| `jest-dom/prefer-required` | - | ⚠️ No equivalent |
| `jest-dom/prefer-to-have-attribute` | - | ⚠️ No equivalent |
| `testing-library/await-async-queries` | - | ⚠️ No equivalent |
| `testing-library/no-await-sync-queries` | - | ⚠️ No equivalent |
| `testing-library/no-debugging-utils` | - | ⚠️ No equivalent |

### Other Rules

| ESLint Rule | Biome Equivalent | Status |
|-------------|------------------|--------|
| `jsdoc/require-jsdoc` (with @summary) | - | ⚠️ No equivalent |
| `css-modules/no-unused-class` | - | ⚠️ No equivalent |
| `css-modules/no-undef-class` | - | ⚠️ No equivalent |
| `lodash/import-scope` | - | ⚠️ No equivalent |
| `storybook/*` | - | ⚠️ No equivalent |
| `no-restricted-globals` | `noRestrictedGlobals` | ✅ |
| `no-void` | `noVoid` | ✅ |
| `no-underscore-dangle` | - | N/A (disabled) |
| `max-classes-per-file` | - | N/A (disabled) |
| `no-case-declarations` | - | N/A (disabled) |
| `no-template-curly-in-string` | `noTemplateCurlyInString` | ✅ |
| `no-restricted-syntax` | - | N/A (disabled) |

---

## Rules Without Biome Equivalents

### Critical (Require Alternative Solution)

1. **`react-refresh/only-export-components`** - Ensures Vite Fast Refresh compatibility
   - **Solution**: Keep ESLint only for this rule OR accept potential HMR issues during dev

2. **`jsdoc/require-jsdoc` with `@summary`** - Required for backend controllers
   - **Solution**: Keep ESLint only for this rule OR create a custom Biome plugin OR use manual review

### Non-Critical (Can Be Dropped)

1. **Testing Library rules** (`jest-dom/*`, `testing-library/*`)
   - Low impact: these are best-practice recommendations, not correctness rules
   - **Solution**: Drop and rely on code review

2. **CSS Modules rules** (`css-modules/*`)
   - **Solution**: TypeScript/build errors will catch most issues

3. **Lodash import scope** (`lodash/import-scope`)
   - **Solution**: Can be enforced via code review or a simple grep in CI

4. **Storybook rules** (`storybook/*`)
   - **Solution**: Storybook build will catch most issues

5. **`@typescript-eslint/no-unsafe-*`** rules
   - Already disabled for legacy code in current config
   - `noExplicitAny` covers the main use case

---

## Phased Rollout Strategy

### Phase 1: Setup & Parallel Running (Week 1)

1. **Install Biome**
   ```bash
   pnpm add -D -E @biomejs/biome
   ```

2. **Run migration tool**
   ```bash
   npx @biomejs/biome migrate eslint --write --include-inspired
   npx @biomejs/biome migrate prettier --write
   ```

3. **Create initial `biome.json`**
   - Review auto-generated config
   - Add package-specific overrides
   - Configure VCS integration

4. **Add parallel npm scripts**
   ```json
   {
     "lint:biome": "biome check .",
     "lint:biome:fix": "biome check --write ."
   }
   ```

5. **Run both linters in CI** (ESLint + Biome)
   - Compare results
   - Identify discrepancies

### Phase 2: Fix Biome Violations (Week 2-3)

1. **Auto-fix safe issues**
   ```bash
   npx @biomejs/biome check --write .
   ```

2. **Manually fix remaining issues**
   - Prioritize by package: common → backend → frontend → cli → warehouses → e2e

3. **Suppress false positives** using inline comments
   ```typescript
   // biome-ignore lint/suspicious/noExplicitAny: legacy code
   ```

### Phase 3: ESLint Deprecation (Week 4)

1. **Update lint scripts to use Biome only**
   ```json
   {
     "lint": "biome check .",
     "fix-lint": "biome check --write ."
   }
   ```

2. **Keep ESLint only for rules without Biome equivalents**
   - `react-refresh/only-export-components` (frontend only)
   - `jsdoc/require-jsdoc` with `@summary` (backend controllers only)

3. **Create minimal ESLint config** for retained rules
   ```javascript
   // .eslintrc.minimal.js
   module.exports = {
     plugins: ['react-refresh', 'jsdoc'],
     rules: {
       'react-refresh/only-export-components': 'error',
       'jsdoc/require-jsdoc': ['error', { /* config */ }]
     }
   };
   ```

4. **Update CI to run both**
   ```yaml
   - run: pnpm biome check .
   - run: pnpm eslint --config .eslintrc.minimal.js packages/frontend packages/backend
   ```

### Phase 4: Cleanup (Week 5)

1. **Remove unnecessary ESLint dependencies**
   ```bash
   pnpm remove -r eslint eslint-config-airbnb eslint-config-airbnb-base \
     eslint-config-airbnb-typescript eslint-config-prettier \
     eslint-plugin-import eslint-plugin-json eslint-plugin-react \
     eslint-plugin-react-hooks eslint-plugin-jsx-a11y eslint-plugin-prettier \
     eslint-plugin-jest eslint-plugin-jest-dom eslint-plugin-testing-library \
     eslint-plugin-storybook eslint-plugin-lodash eslint-plugin-css-modules \
     @typescript-eslint/parser @typescript-eslint/eslint-plugin \
     confusing-browser-globals
   ```

2. **Delete old ESLint configs**
   ```bash
   rm .eslintrc.js packages/*/.eslintrc.js .eslintignore
   ```

3. **Update pre-commit hooks** (lint-staged)
   ```javascript
   // lint-staged.config.js
   module.exports = {
     '*.{js,jsx,ts,tsx,json}': ['biome check --write'],
   };
   ```

4. **Update VS Code settings**
   ```json
   {
     "editor.defaultFormatter": "biomejs.biome",
     "editor.formatOnSave": true,
     "editor.codeActionsOnSave": {
       "quickfix.biome": "explicit"
     }
   }
   ```

5. **Update CLAUDE.md and documentation**

---

## Proposed biome.json Configuration

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "include": ["packages/**/*.ts", "packages/**/*.tsx", "packages/**/*.js", "packages/**/*.jsx"],
    "ignore": [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/coverage/**",
      "packages/backend/src/ee/services/McpService/mcp-chart-app/**"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 4,
    "lineWidth": 100
  },
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "nursery": {
        "noFloatingPromises": "error"
      },
      "complexity": {
        "noExtraBooleanCast": "error",
        "noMultipleSpacesInRegularExpressionLiterals": "error",
        "noUselessCatch": "error",
        "noUselessTypeConstraint": "error",
        "noWith": "error"
      },
      "correctness": {
        "noConstAssign": "error",
        "noConstantCondition": "error",
        "noEmptyCharacterClassInRegex": "error",
        "noEmptyPattern": "error",
        "noGlobalObjectCalls": "error",
        "noInnerDeclarations": "error",
        "noInvalidConstructorSuper": "error",
        "noInvalidNewBuiltin": "error",
        "noNonoctalDecimalEscape": "error",
        "noPrecisionLoss": "error",
        "noSelfAssign": "error",
        "noSetterReturn": "error",
        "noSwitchDeclarations": "error",
        "noUndeclaredVariables": "error",
        "noUnreachable": "error",
        "noUnreachableSuper": "error",
        "noUnsafeFinally": "error",
        "noUnsafeOptionalChaining": "error",
        "noUnusedLabels": "error",
        "noUnusedVariables": "error",
        "useIsNan": "error",
        "useValidForDirection": "error",
        "useYield": "error"
      },
      "style": {
        "noNamespace": "error",
        "useAsConstAssertion": "error",
        "useImportType": "error",
        "useExportType": "error"
      },
      "suspicious": {
        "noAsyncPromiseExecutor": "error",
        "noCatchAssign": "error",
        "noClassAssign": "error",
        "noCompareNegZero": "error",
        "noControlCharactersInRegex": "error",
        "noDebugger": "error",
        "noDoubleEquals": "error",
        "noDuplicateCase": "error",
        "noDuplicateClassMembers": "error",
        "noDuplicateObjectKeys": "error",
        "noDuplicateParameters": "error",
        "noEmptyBlockStatements": "error",
        "noExplicitAny": "error",
        "noExtraNonNullAssertion": "error",
        "noFallthroughSwitchClause": "error",
        "noFunctionAssign": "error",
        "noGlobalAssign": "error",
        "noImportAssign": "error",
        "noMisleadingCharacterClass": "error",
        "noMisleadingInstantiator": "error",
        "noPrototypeBuiltins": "error",
        "noRedeclare": "error",
        "noShadowRestrictedNames": "error",
        "noUnsafeDeclarationMerging": "error",
        "noUnsafeNegation": "error",
        "useGetterReturn": "error",
        "useValidTypeof": "error"
      }
    }
  },
  "overrides": [
    {
      "include": ["packages/frontend/**"],
      "linter": {
        "rules": {
          "a11y": {
            "recommended": true
          },
          "correctness": {
            "useExhaustiveDependencies": "error",
            "useHookAtTopLevel": "error",
            "useJsxKeyInIterable": "error"
          },
          "suspicious": {
            "noCommentText": "error",
            "noDuplicateJsxProps": "error"
          },
          "security": {
            "noDangerouslySetInnerHtml": "warn",
            "noDangerouslySetInnerHtmlWithChildren": "error"
          }
        }
      }
    },
    {
      "include": ["packages/e2e/**", "**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
      "linter": {
        "rules": {
          "suspicious": {
            "noExplicitAny": "off"
          }
        }
      }
    }
  ]
}
```

---

## Dependencies to Remove

After full migration, these packages can be removed:

```bash
# ESLint core and parser
eslint
@typescript-eslint/parser
@typescript-eslint/eslint-plugin

# Config packages
eslint-config-airbnb
eslint-config-airbnb-base
eslint-config-airbnb-typescript
eslint-config-prettier

# Plugins (most of them)
eslint-plugin-import
eslint-plugin-json
eslint-plugin-prettier
eslint-plugin-react (if not needed for react-refresh)
eslint-plugin-react-hooks
eslint-plugin-jsx-a11y
eslint-plugin-css-modules
eslint-plugin-jest
eslint-plugin-jest-dom
eslint-plugin-testing-library
eslint-plugin-storybook
eslint-plugin-lodash

# Utilities
confusing-browser-globals

# Keep (if using minimal ESLint for specific rules):
# eslint-plugin-react-refresh
# eslint-plugin-jsdoc
```

---

## Migration Checklist

- [ ] Install Biome (`pnpm add -D -E @biomejs/biome`)
- [ ] Run `biome migrate eslint --write --include-inspired`
- [ ] Run `biome migrate prettier --write`
- [ ] Review and adjust generated `biome.json`
- [ ] Add Biome VS Code extension recommendation
- [ ] Run `biome check .` and review violations
- [ ] Auto-fix safe violations with `biome check --write .`
- [ ] Manually fix remaining violations per package
- [ ] Run both ESLint and Biome in CI for validation
- [ ] Update npm scripts to use Biome
- [ ] Create minimal ESLint config for retained rules
- [ ] Update lint-staged configuration
- [ ] Remove unnecessary ESLint dependencies
- [ ] Delete old ESLint config files
- [ ] Update VS Code workspace settings
- [ ] Update CLAUDE.md and other documentation
- [ ] Update CI/CD pipelines
- [ ] Announce migration to team

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `noFloatingPromises` in nursery (unstable) | Medium | Monitor Biome releases; rule is actively maintained by Vercel |
| Missing testing library rules | Low | Rely on code review; tests will still run |
| Missing react-refresh rule | Medium | Keep minimal ESLint for frontend only |
| Different behavior in some rules | Low | Run parallel for 1-2 weeks before switching |
| Team learning curve | Low | Biome CLI is simpler than ESLint |

---

## Resources

- [Biome Official Documentation](https://biomejs.dev/)
- [Biome Migration Guide](https://biomejs.dev/guides/migrate-eslint-prettier/)
- [Biome Rules Sources](https://biomejs.dev/linter/rules-sources/)
- [noFloatingPromises Rule](https://biomejs.dev/linter/rules/no-floating-promises/)
- [Biome GitHub Discussions](https://github.com/biomejs/biome/discussions/3)
