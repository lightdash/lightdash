---
name: breakup-pr
description: |
  Break up a large PR into vertical feature slices delivered incrementally via Graphite stacked PRs.
  All verticals share a single feature flag so the entire feature ships atomically.
  Use when: splitting a large PR, breaking up a diff, vertical slicing, incremental delivery,
  phased rollout, or when a PR is too large to review.
triggers:
  - breakup-pr
  - break up PR
  - split PR into verticals
  - vertical slices
  - incremental delivery
  - PR too large
  - split this PR
  - break this down
  - phased delivery
  - vertical features
invocation: user
argument-hint: "[PR URL or branch name]"
arguments: pr-url
---

# Break Up PR into Vertical Feature Slices

You are splitting a large PR into **vertical feature slices** — each slice is an independently mergeable, CI-green stacked PR delivered via **Graphite** (see the `graphite` skill for gt commands).

All slices are gated behind a **single shared feature flag** so the feature ships atomically when the flag is enabled.

## Why Vertical Slices?

Large PRs are hard to review, hard to reason about, and risky to merge. Vertical slicing solves this by breaking work into small, focused changes that are easier to understand and safer to ship.

**Easier code review:**
- Reviewers can focus on one concern at a time (e.g., "just the migration" or "just the API")
- Each PR tells a clear story — what changed and why is obvious from the diff
- Smaller diffs mean faster reviews and higher-quality feedback
- Comments and discussions stay focused instead of sprawling across unrelated changes

**Iterative improvement:**
- Each slice can be reviewed, refined, and merged independently
- Feedback on early slices (e.g., schema design) can inform later slices before they're written
- If a later slice needs rework, earlier slices are already safely merged
- The stack shows a natural progression — reviewers understand the "journey" of the feature

**Safer delivery:**
- Smaller changes = smaller blast radius if something goes wrong
- Issues are easier to bisect — you know exactly which slice introduced a problem
- Rollback is surgical: revert one slice, not the whole feature
- CI catches issues earlier in the stack, before dependent code is written

**Better collaboration:**
- Multiple people can review different slices in parallel
- Stack structure makes dependencies explicit — no guessing what to review first
- Merge conflicts are localized to individual slices
- Progress is visible: "3 of 5 PRs merged" is clearer than "PR still in review"

**The feature flag unifies it all:** Even though slices merge incrementally, the feature flag keeps everything hidden until you're ready to ship. Merge with confidence, ship when ready.

## Process

### Step 1: Analyze the PR

If given a PR URL, fetch and analyze the diff:
```bash
gh pr diff <PR_NUMBER>
```

If on a branch, analyze the diff against main:
```bash
git diff main...HEAD
```

Understand:
- What files are changed and why
- The dependency graph between changes (schema → backend → frontend)
- What constitutes a "vertical" — an independently testable slice of functionality

### Step 2: Identify the Feature Flag

Determine the feature flag name for this feature:
- Check if the PR already uses a feature flag — if so, reuse it
- If not, create one following the naming convention: **kebab-case** (e.g., `my-new-feature`)

The feature flag goes in `packages/common/src/types/featureFlags.ts`:
```typescript
export enum FeatureFlags {
    // ... existing flags
    MyNewFeature = 'my-new-feature',
}
```

**CRITICAL**: The same feature flag is used for ALL vertical slices. This ensures the entire feature is gated atomically.

### Step 3: Plan the Vertical Slices

Break the PR into vertical slices ordered by dependency (bottom of stack = first to merge):

**What is a vertical slice?**
A vertical slice is a thin, end-to-end piece of **user-facing functionality** that cuts through all architectural layers (migration + types + backend + API + frontend). Each slice delivers something a user could test or demo, even if it's narrow.

**How to identify slices:**
Think about the feature from the user's perspective. Ask: "What are the distinct things a user can *do* with this feature?" Each answer is a candidate slice.

For example, a "content verification" feature might slice as:
1. Admin can verify/unverify a **chart** (migration + model + service + API + UI — but only for charts)
2. Admin can verify/unverify a **dashboard** (extend to dashboards)
3. Verified badge appears in **search and content browser**
4. Editing content **auto-removes** verification
5. Admin **settings panel** to view all verified content

Each slice touches every layer it needs — that's what makes it vertical.

**Anti-pattern: horizontal/layer slicing**
Do NOT slice by architectural layer (e.g., "PR 1: migration", "PR 2: backend types", "PR 3: API", "PR 4: frontend"). This produces PRs that aren't independently testable and forces reviewers to hold the whole feature in their head across multiple PRs.

**Slicing guidelines:**
- Start with the **narrowest end-to-end path** — the simplest user action that exercises the full stack
- Subsequent slices **widen** the feature: new entity types, new surfaces, new behaviors, edge cases
- Infrastructure-only slices (e.g., a migration with no consumers) are acceptable ONLY when the migration is complex enough to warrant isolated review — and even then, prefer bundling it with the first slice that uses it
- Each slice should tell a coherent story: a reviewer should understand what user-facing change this enables

**Each slice MUST:**
- Be independently mergeable and CI-green
- Gate new behavior behind the shared feature flag
- Not break existing functionality when the flag is OFF
- Be reviewable in isolation (aim for <600 lines per PR)
- Be describable as a user-facing capability (not an architectural layer)

**Present the plan to the user before coding:**
```
Feature flag: FeatureFlags.MyNewFeature ('my-new-feature')

Stack plan (bottom → top):
  1. PR: Admin can verify a chart (migration + types + model + service + API + UI)
  2. PR: Extend verification to dashboards
  3. PR: Show verified badge in search and content browser
  4. PR: Auto-remove verification on content edit
  5. PR: Admin settings panel to manage verified content
```

Wait for user confirmation before proceeding.

### Step 4: Implement Each Slice

For each slice, follow this pattern:

1. **Checkout the right position in the stack:**
   - First slice: `gt co main` then start
   - Subsequent slices: stay on previous branch (gt will stack automatically)

2. **Make the changes for this slice only**

3. **Gate new behavior behind the feature flag:**

   **Backend pattern:**
   ```typescript
   import { FeatureFlags } from '@lightdash/common';

   // In a service method:
   const featureFlag = await this.featureFlagModel.get({
       user,
       featureFlagId: FeatureFlags.MyNewFeature,
   });
   if (!featureFlag.enabled) {
       throw new ForbiddenError('Feature not enabled');
   }
   ```

   **Frontend pattern:**
   ```typescript
   import { FeatureFlags } from '@lightdash/common';
   import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';

   const { data: featureFlag } = useServerFeatureFlag(FeatureFlags.MyNewFeature);

   // Conditionally render:
   if (!featureFlag?.enabled) return null;
   // or
   {featureFlag?.enabled && <NewComponent />}
   ```

4. **Run checks:**
   ```bash
   pnpm -F <package> lint
   pnpm -F <package> typecheck
   pnpm -F <package> test  # or test:dev:nowatch for backend
   ```

5. **Create the branch and submit:**
   ```bash
   git add <specific-files>
   gt c --no-interactive -m 'feat: <description>'
   gt s --no-interactive
   ```

### Step 5: Submit the Stack

After all slices are implemented:
```bash
gt s --stack --no-interactive
```

Verify the stack looks correct:
```bash
gt log
```

## Feature Flag Placement Guide

| Layer | Where to gate | Pattern |
|-------|--------------|---------|
| **Database migration** | Usually NOT gated — migrations run regardless. Design schema to be backwards-compatible. |  |
| **Backend model** | Usually NOT gated — models can exist without being called. | |
| **Backend service** | Gate at the **service method entry point** | `featureFlagModel.get(...)` check |
| **Backend controller/route** | Gate in the **controller** if the entire endpoint is new | `featureFlagModel.get(...)` check |
| **Frontend route/page** | Gate at the **route or page level** | `useServerFeatureFlag(...)` |
| **Frontend component** | Gate at the **component render** | Conditional render with flag check |
| **Frontend nav/menu item** | Gate the **menu entry** | Conditional render with flag check |

## Key Files Reference

| Purpose | File |
|---------|------|
| Feature flag enum | `packages/common/src/types/featureFlags.ts` |
| Commercial flags | `packages/common/src/ee/commercialFeatureFlags.ts` |
| Backend flag model | `packages/backend/src/models/FeatureFlagModel/FeatureFlagModel.ts` |
| Backend flag service | `packages/backend/src/services/FeatureFlag/FeatureFlagService.ts` |
| Frontend flag hooks | `packages/frontend/src/hooks/useServerOrClientFeatureFlag.ts` |
| PostHog integration | `packages/backend/src/postHog.ts` |

## Anti-patterns to Avoid

- **Horizontal/layer slicing** — DO NOT create PRs like "migration PR", "backend types PR", "API PR", "frontend PR". Each PR should be a vertical slice through all necessary layers
- **Different feature flags per slice** — use ONE flag for the whole feature
- **Mixing unrelated changes** — each PR is one logical vertical
- **Breaking existing behavior when flag is OFF** — feature-flagged code must be invisible when disabled
- **Giant slices** — if a slice is >600 lines, break it down further
- **Skipping typecheck/lint** — every slice must be CI-green independently
- **Infrastructure-only PRs with no user-facing change** — prefer bundling infrastructure with the first slice that uses it

## Completion Criteria

- All slices are submitted as a Graphite stack
- Each PR passes lint, typecheck, and tests independently
- All new behavior is gated behind the single shared feature flag
- Working tree is clean
- Stack is visible via `gt log`
