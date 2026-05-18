# AI Artifact Panel Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current AI artifact sidebar with a floating chromeless panel that morphs from the chat-thread artifact button when opened.

**Architecture:** Add `motion` (formerly framer-motion) as a frontend dep. Use `layoutId` for shared-element morph between `AiArtifactButton` (chat-thread version) and a rewritten `AiArtifactPanel` (right-side panel). Wrap the workspace in `LayoutGroup`. Replace the `react-resizable-panels` Panel for the artifact column with a floating region that gives the panel a 12 px margin and a soft shadow. Chart-type switcher moves out of the visualization body and renders as a dark pill floating at the bottom edge of the panel. No feature flag — direct replacement.

**Tech Stack:** React 19, Mantine v8, motion ^12, CSS modules. Worktree: `.claude/worktrees/feat-ai-artifact-panel-redesign` on branch `worktree-feat-ai-artifact-panel-redesign`.

**Note on TDD:** This is a UI restructure on top of unchanged data hooks. There is no meaningful unit test target for the motion or the chrome layout — the value of an automated test would be ~0 vs the cost of brittle DOM assertions. Verification per task is lint + typecheck + manual smoke in the running dev server, with a final manual sweep at the end. The plan calls this out explicitly rather than inventing tests for the sake of TDD ritual.

---

## File Structure

**Modified:**
- `packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiArtifactPanel.tsx` — full rewrite. Becomes the floating chromeless panel + floating chart-type pill. Same exported component name and props (`artifact`, `showCloseButton`) so existing consumers don't break. Adds a `variant: 'floating' | 'inline'` prop with default `'floating'`.
- `packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiArtifactInline.tsx` — pass `variant="inline"` so the admin verified-content view keeps its current inline chrome.
- `packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiChartVisualization.tsx` — drop the in-body header content; surface title / description / action icons via two new optional props (`chromeLeftSlot`, `chromeRightSlot`) that the panel pulls into its chromeless head. Stop rendering the chart-type switcher inline; controlled `selectedChartType` + `onChartTypeChange` come from the panel.
- `packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiVisualizationRenderer.tsx` — accept controlled `selectedChartType` / `onChartTypeChange`; suppress its internal switcher when controlled.
- `packages/frontend/src/ee/features/aiCopilot/components/ChatElements/ArtifactButton/AiArtifactButton.tsx` — wrap the outer `UnstyledButton` in `motion.button` with `layoutId={artifact?.artifactUuid ? `ai-artifact-${artifact.artifactUuid}-${artifact.versionUuid}` : undefined}`. Render a non-motion placeholder of the same shape when `isArtifactOpen` is true (so the chat doesn't reflow and motion only sees one host of the layoutId at a time).
- `packages/frontend/src/ee/features/aiCopilot/components/AiAgentPageLayout/AiAgentPageLayout.tsx` — replace the right `Panel` (from `react-resizable-panels`) with a fixed-margin floating region; wrap the entire `PanelGroup` (and the floating region) in `<LayoutGroup>` from motion. No resize handle for the artifact column.
- `packages/frontend/src/ee/features/aiCopilot/components/AiAgentPageLayout/aiAgentPageLayout.module.css` — add `.floatingArtifactRegion` and `.floatingArtifactPanel` styles.

**Created:**
- `packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiArtifactPanel.module.css` — chromeless head, body, floating pill positioning.

**Dependency change:**
- `packages/frontend/package.json` — add `"motion": "^12.0.0"` (latest stable as of plan date).

---

### Task 1: Add the `motion` dependency

**Files:**
- Modify: `packages/frontend/package.json` (via pnpm)
- Modify: `pnpm-lock.yaml` (via pnpm)

- [ ] **Step 1: Install motion at the frontend workspace**

Run:
```bash
sfw corepack pnpm -F frontend add motion
```

Expected: lockfile updates, `motion` and its peer deps land under `packages/frontend/node_modules/motion`. Per repo memory: must use `corepack pnpm` (pinned 10.x), not system pnpm. Per repo CLAUDE.md: must use `sfw` for installs.

- [ ] **Step 2: Confirm the install**

Run:
```bash
grep '"motion"' packages/frontend/package.json
```

Expected: prints a single line with the new dep at `^12.x.x` or whatever pnpm picked.

- [ ] **Step 3: Run the frontend typecheck baseline (no source changes yet)**

Run:
```bash
pnpm -F frontend typecheck 2>&1 | tail -20
```

Expected: passes. If new TS errors appear, they're pre-existing — note them and continue.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore(frontend): add motion for shared-element transitions

Used by the upcoming AI artifact panel redesign for the morph between
the chat-thread AiArtifactButton and the floating panel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add `layoutId` to `AiArtifactButton`

**Files:**
- Modify: `packages/frontend/src/ee/features/aiCopilot/components/ChatElements/ArtifactButton/AiArtifactButton.tsx`

The button currently renders an `UnstyledButton`. We wrap the *outer* element in `motion.button` with a stable `layoutId` derived from `artifact.artifactUuid` + `versionUuid`. When the panel is open (`isArtifactOpen=true`), we render a non-motion `UnstyledButton` placeholder of the same shape, so motion sees exactly one host of the layoutId at a time and the chat layout doesn't reflow.

- [ ] **Step 1: Replace the file**

Write:
```tsx
import {
    assertUnreachable,
    type AiAgentMessageAssistant,
} from '@lightdash/common';
import { Box, Loader, Text, UnstyledButton } from '@mantine-8/core';
import {
    IconArtboard,
    IconChartBar,
    IconChevronRight,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { motion } from 'motion/react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import styles from './AiArtifactButton.module.css';

interface AiArtifactButtonProps {
    onClick: () => void;
    isArtifactOpen: boolean;
    artifact: NonNullable<AiAgentMessageAssistant['artifacts']>[0] | null;
    isLoading?: boolean;
}

const MotionUnstyledButton = motion(UnstyledButton);

export const AiArtifactButton: FC<AiArtifactButtonProps> = ({
    onClick,
    isLoading = false,
    isArtifactOpen = false,
    artifact,
}) => {
    const displayTitle = artifact?.title;

    const ArtifactIcon = useMemo(() => {
        if (!artifact) return IconArtboard;

        switch (artifact.artifactType) {
            case 'chart':
                return IconChartBar;
            case 'dashboard':
                return IconLayoutDashboard;
            default:
                return assertUnreachable(
                    artifact.artifactType,
                    `invalid artifact type ${artifact.artifactType}`,
                );
        }
    }, [artifact]);

    const layoutId = artifact
        ? `ai-artifact-${artifact.artifactUuid}-${artifact.versionUuid}`
        : undefined;

    const innerBody = (
        <Box className={styles.container}>
            <Box className={styles.iconChip}>
                {isLoading ? (
                    <Loader size={12} color="ldGray.5" />
                ) : (
                    <MantineIcon
                        icon={ArtifactIcon}
                        size={14}
                        stroke={1.5}
                        className={styles.icon}
                    />
                )}
            </Box>

            <Box className={styles.content}>
                {isLoading ? (
                    <Text className={styles.loadingLabel}>Creating…</Text>
                ) : (
                    displayTitle && (
                        <Text className={styles.title}>{displayTitle}</Text>
                    )
                )}
            </Box>

            {!isLoading && (
                <MantineIcon
                    icon={IconChevronRight}
                    size={14}
                    className={styles.chevron}
                />
            )}
        </Box>
    );

    if (isArtifactOpen) {
        // Placeholder of the same shape — preserves chat layout while the
        // panel takes over as the layoutId host. No motion wrapper so we
        // don't double-mount the same layoutId.
        return (
            <UnstyledButton
                className={styles.artifactButton}
                data-artifact-open={isArtifactOpen}
                data-loading={isLoading}
                onClick={onClick}
                disabled
            >
                {innerBody}
            </UnstyledButton>
        );
    }

    return (
        <MotionUnstyledButton
            layoutId={layoutId}
            className={styles.artifactButton}
            data-artifact-open={isArtifactOpen}
            data-loading={isLoading}
            onClick={onClick}
            disabled={isLoading}
        >
            {innerBody}
        </MotionUnstyledButton>
    );
};
```

- [ ] **Step 2: Typecheck**

Run:
```bash
pnpm -F frontend typecheck 2>&1 | tail -10
```

Expected: passes. If `motion(UnstyledButton)` triggers a forwardRef typing issue, see Step 3.

- [ ] **Step 3 (fallback if Step 2 fails): wrap in a `motion.div` instead**

If `motion(UnstyledButton)` errors on forwardRef typing, replace `MotionUnstyledButton` with a `motion.div` wrapper around `UnstyledButton`:

```tsx
const MotionDiv = motion.div;
// ...
return (
    <MotionDiv layoutId={layoutId} style={{ display: 'block' }}>
        <UnstyledButton
            className={styles.artifactButton}
            data-artifact-open={isArtifactOpen}
            data-loading={isLoading}
            onClick={onClick}
            disabled={isLoading}
        >
            {innerBody}
        </UnstyledButton>
    </MotionDiv>
);
```

Re-run typecheck. The wrapper div is the morph target.

- [ ] **Step 4: Lint**

Run:
```bash
pnpm -F frontend lint 2>&1 | tail -10
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/ee/features/aiCopilot/components/ChatElements/ArtifactButton/AiArtifactButton.tsx
git commit -m "$(cat <<'EOF'
feat(ai): wrap AiArtifactButton with motion layoutId

Adds the shared-element source for the upcoming morph into the floating
artifact panel. When the panel is open, the button renders as a disabled
placeholder so motion sees exactly one host of the layoutId at a time
and chat layout doesn't reflow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Make `AiVisualizationRenderer` controllable for chart type, hide internal switcher

**Files:**
- Modify: `packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiVisualizationRenderer.tsx`

We need the floating chart-type pill to live in the panel chrome (not inside the renderer body). The cleanest way is to make `selectedChartType` controlled from outside and have the renderer suppress its internal switcher when controlled.

- [ ] **Step 1: Locate the current internal state**

Run:
```bash
grep -n "selectedChartType\|setSelectedChartType\|defaultChartType" packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiVisualizationRenderer.tsx
```

Note the line numbers — we'll patch the state declaration and the switcher render block.

- [ ] **Step 2: Add controlled props to the `Props` type**

In `AiVisualizationRenderer.tsx`, extend `Props`:

```tsx
type Props = {
    results: InfiniteQueryResults;
    queryExecutionHandle: QueryObserverSuccessResult<
        ApiAiAgentThreadMessageVizQuery,
        ApiError
    >;
    chartConfig:
        | ToolTableVizArgs
        | ToolTimeSeriesArgs
        | ToolVerticalBarArgs
        | ToolRunQueryArgs;
    headerContent?: ReactNode;

    onDashboardChartTypeChange?: (type: AiAgentChartTypeOption) => void;
    onDashboardChartConfigChange?: (config: ChartConfig) => void;

    /** When provided, chart type is controlled externally and the
     *  internal switcher is suppressed. The caller renders its own. */
    controlledChartType?: AiAgentChartTypeOption;
    onControlledChartTypeChange?: (type: AiAgentChartTypeOption) => void;
};
```

- [ ] **Step 3: Use the controlled value if present**

Inside the component, after the existing `const [selectedChartType, setSelectedChartType] = useState(...)`, derive the effective type:

```tsx
const effectiveChartType = controlledChartType ?? selectedChartType;
```

Replace usages of `selectedChartType` in the render body (the value passed to `LightdashVisualization`, the value passed into the internal switcher) with `effectiveChartType`. Replace the `handleChartTypeChange` body with:

```tsx
const handleChartTypeChange = useCallback(
    (chartType: AiAgentChartTypeOption) => {
        if (onControlledChartTypeChange) {
            onControlledChartTypeChange(chartType);
        } else {
            setSelectedChartType(chartType);
        }
        onDashboardChartTypeChangeProp?.(chartType);
    },
    [onControlledChartTypeChange, onDashboardChartTypeChangeProp],
);
```

- [ ] **Step 4: Suppress the internal switcher when controlled**

Wrap the existing `<Group justify="flex-end"><AgentVisualizationChartTypeSwitcher … /></Group>` block in a `controlledChartType === undefined && (...)` guard:

```tsx
{chartConfigFromAiAgentVizConfig.type === AiResultType.QUERY_RESULT &&
    controlledChartType === undefined && (
        <Group justify="flex-end">
            <AgentVisualizationChartTypeSwitcher
                metricQuery={metricQuery}
                selectedChartType={effectiveChartType ?? defaultChartType}
                hasGroupByDimensions={(groupByDimensions?.length ?? 0) > 0}
                onChartTypeChange={handleChartTypeChange}
            />
        </Group>
    )}
```

- [ ] **Step 5: Typecheck + lint**

Run:
```bash
pnpm -F frontend typecheck 2>&1 | tail -10 && pnpm -F frontend lint 2>&1 | tail -10
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiVisualizationRenderer.tsx
git commit -m "$(cat <<'EOF'
refactor(ai): make AiVisualizationRenderer chart-type controllable

Adds controlledChartType + onControlledChartTypeChange props. When
provided, the renderer suppresses its internal switcher so the caller
can render its own (e.g., as a floating pill outside the chart body).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Strip the inline header from `AiChartVisualization`, expose chrome slots

**Files:**
- Modify: `packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiChartVisualization.tsx`

Currently `AiChartVisualization` builds a `headerContent` JSX block inline (title + description + ViewSqlButton + AiChartQuickOptions + close) and passes it to `AiVisualizationRenderer`. For the chromeless panel we lift that out: the panel composes title/description on the left and a slim action row on the right itself, and the chart visualization just exposes the *content* of those slots.

We do this with two new optional props (`renderChromeLeft`, `renderChromeRight`) that the panel calls. If neither is provided, the visualization falls back to the original inline header for backwards compatibility (`AiArtifactInline`'s inline mode and anywhere else that doesn't opt in).

- [ ] **Step 1: Add the props and supporting state**

In the file, extend `Props`:

```tsx
type Props = {
    artifactData: AiArtifact;
    projectUuid: string;
    agentUuid: string;
    artifactUuid: string;
    versionUuid: string;
    message: AiAgentMessageAssistant;
    showCloseButton?: boolean;
    /** Provided by the floating panel to lift the title/description into
     *  the chromeless head. When absent, the inline header is used. */
    renderChromeLeft?: (props: {
        title: string;
        description: string | null;
    }) => ReactNode;
    /** Provided by the floating panel to lift the action icons into
     *  the chromeless head. */
    renderChromeRight?: (props: {
        compiledSql: string | undefined;
        artifactData: AiArtifact;
    }) => ReactNode;
    /** When provided, chart type is controlled by the panel (so it can
     *  render the floating pill). */
    controlledChartType?: AiAgentChartTypeOption;
    onControlledChartTypeChange?: (type: AiAgentChartTypeOption) => void;
};
```

Add the matching imports at the top:

```tsx
import { type AiAgentChartTypeOption } from '@lightdash/common';
import { type ReactNode } from 'react';
```

(Existing imports already cover `AiArtifact`, `Group`, etc.)

- [ ] **Step 2: Conditional render of the header**

Replace the existing render-return block (around lines 125–172) with:

```tsx
const title = queryExecutionHandle.data.metadata.title;
const description = queryExecutionHandle.data.metadata.description ?? null;

const headerContent =
    renderChromeLeft || renderChromeRight ? null : (
        <Group gap="md" align="start">
            <Stack gap={0} flex={1}>
                <Title order={5}>{title}</Title>
                <Text c="dimmed" size="xs">
                    {description}
                </Text>
            </Stack>
            <Group gap="sm" display={isMobile ? 'none' : 'flex'}>
                <ViewSqlButton sql={compiledSql?.query} />
                <AiChartQuickOptions
                    message={message}
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    artifactData={artifactData}
                    saveChartOptions={{
                        name: title,
                        description: description ?? undefined,
                        linkToMessage: true,
                    }}
                    compiledSql={compiledSql?.query}
                />
                {showCloseButton && (
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="ldGray.4"
                        onClick={() => dispatch(clearArtifact())}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                )}
            </Group>
        </Group>
    );

return (
    <Stack gap="md" h="100%">
        <AiVisualizationRenderer
            results={queryResults}
            queryExecutionHandle={queryExecutionHandle}
            chartConfig={artifactData.chartConfig!}
            headerContent={headerContent}
            controlledChartType={controlledChartType}
            onControlledChartTypeChange={onControlledChartTypeChange}
        />
    </Stack>
);
```

The new slot props (`renderChromeLeft`, `renderChromeRight`) are passed UP — i.e., they're _returned_ to the panel via this component. To do that without breaking encapsulation, instead expose helper data via React context **or** simply have the panel build its own chrome and call the visualization in a "chrome-disabled" mode.

**Simpler approach (use this):** drop the `renderChromeLeft`/`renderChromeRight` slot-prop idea entirely. The panel doesn't need title/description from inside the visualization — it can fetch them itself from the same `useAiAgentArtifactVizQuery` hook the visualization uses. Or even simpler: pull title/description from `artifactData.metadata` if present.

Revise the patch: keep only the `controlledChartType` / `onControlledChartTypeChange` props. Remove the `renderChromeLeft` / `renderChromeRight` props. The visualization renders no header when `headerContent` from the parent is `null`. The panel injects its own header at the panel level (Task 5).

Replace the patch above with this simpler block:

```tsx
type Props = {
    artifactData: AiArtifact;
    projectUuid: string;
    agentUuid: string;
    artifactUuid: string;
    versionUuid: string;
    message: AiAgentMessageAssistant;
    showCloseButton?: boolean;
    /** Set false to suppress the legacy inline header — the parent renders chrome. */
    showInlineHeader?: boolean;
    controlledChartType?: AiAgentChartTypeOption;
    onControlledChartTypeChange?: (type: AiAgentChartTypeOption) => void;
};

// ...later in the file...

const title = queryExecutionHandle.data.metadata.title;
const description = queryExecutionHandle.data.metadata.description ?? null;

const headerContent = showInlineHeader === false ? null : (
    /* …existing Group with Title/Description/ViewSql/QuickOptions/Close… */
);

return (
    <Stack gap="md" h="100%">
        <AiVisualizationRenderer
            results={queryResults}
            queryExecutionHandle={queryExecutionHandle}
            chartConfig={artifactData.chartConfig!}
            headerContent={headerContent}
            controlledChartType={controlledChartType}
            onControlledChartTypeChange={onControlledChartTypeChange}
        />
    </Stack>
);
```

Default behavior (no `showInlineHeader` prop) keeps the original inline header, so `AiArtifactInline` and any other current consumer is unaffected.

- [ ] **Step 3: Typecheck + lint**

Run:
```bash
pnpm -F frontend typecheck 2>&1 | tail -10 && pnpm -F frontend lint 2>&1 | tail -10
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiChartVisualization.tsx
git commit -m "$(cat <<'EOF'
refactor(ai): allow AiChartVisualization to suppress inline header

Adds showInlineHeader=false and controlledChartType props so a parent
panel can supply its own chrome (chromeless head + floating switcher
pill) instead of letting the visualization render its inline title row.

Default behavior unchanged for existing consumers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Rewrite `AiArtifactPanel` as the floating chromeless panel

**Files:**
- Modify: `packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiArtifactPanel.tsx`
- Create: `packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiArtifactPanel.module.css`

The panel becomes the layoutId destination. It renders:
- a chromeless 44 px header row: title (truncate) + `i` info tooltip (description) + spacer + ViewSqlButton + AiChartQuickOptions + close (×)
- the chart body (via `AiChartVisualization` with `showInlineHeader={false}`)
- a floating dark pill at the bottom-center holding `AgentVisualizationChartTypeSwitcher` (re-styled).

`variant="inline"` opts out of the floating-panel chrome — used by `AiArtifactInline` for the admin verified-content view. In that case the component renders its current behavior unchanged.

- [ ] **Step 1: Create the CSS module**

Write `packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiArtifactPanel.module.css`:

```css
.floatingPanel {
    height: 100%;
    width: 100%;
    background: var(--mantine-color-body);
    border: 1px solid var(--mantine-color-ldGray-2);
    border-radius: 16px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04),
        0 8px 24px rgba(0, 0, 0, 0.06),
        0 32px 80px rgba(0, 0, 0, 0.08);
    display: grid;
    grid-template-rows: auto 1fr;
    overflow: visible;
    position: relative;
}

@mixin dark {
    .floatingPanel {
        background: var(--mantine-color-ldDark-3);
        border-color: var(--mantine-color-ldDark-5);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2),
            0 8px 24px rgba(0, 0, 0, 0.32),
            0 32px 80px rgba(0, 0, 0, 0.42);
    }
}

.floatingInner {
    border-radius: 16px;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 0;
}

.head {
    display: flex;
    align-items: center;
    gap: var(--mantine-spacing-xs);
    padding: var(--mantine-spacing-sm) var(--mantine-spacing-md)
        var(--mantine-spacing-xs);
}

.title {
    font-size: var(--mantine-font-size-sm);
    font-weight: 600;
    color: var(--mantine-color-text);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.headRight {
    display: flex;
    align-items: center;
    gap: 4px;
}

.body {
    position: relative;
    padding: 0 var(--mantine-spacing-md) calc(var(--mantine-spacing-xl) + 32px);
    min-height: 0;
    display: flex;
    flex-direction: column;
}

.floatingPill {
    position: absolute;
    bottom: var(--mantine-spacing-md);
    left: 50%;
    transform: translateX(-50%);
    background: var(--mantine-color-dark-9);
    border-radius: 999px;
    padding: 4px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18),
        0 2px 6px rgba(0, 0, 0, 0.12);
    z-index: 3;
}

@mixin dark {
    .floatingPill {
        background: var(--mantine-color-ldDark-7);
    }
}

.loading {
    height: 100%;
    display: grid;
    place-items: center;
}
```

- [ ] **Step 2: Rewrite `AiArtifactPanel.tsx`**

Replace the file with:

```tsx
import {
    type AiAgentChartTypeOption,
    type AiAgentMessageAssistant,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    Group,
    Loader,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconExclamationCircle, IconInfoCircle, IconX } from '@tabler/icons-react';
import { LayoutGroup, motion } from 'motion/react';
import { memo, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useCompiledSqlFromMetricQuery } from '../../../../../hooks/useCompiledSql';
import { useAiAgentArtifact } from '../../hooks/useAiAgentArtifacts';
import {
    useAiAgentArtifactVizQuery,
    useAiAgentThread,
} from '../../hooks/useProjectAiAgents';
import { clearArtifact } from '../../store/aiArtifactSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';
import { AgentVisualizationChartTypeSwitcher } from './AgentVisualizationChartTypeSwitcher';
import { AiChartQuickOptions } from './AiChartQuickOptions';
import { AiChartVisualization } from './AiChartVisualization';
import styles from './AiArtifactPanel.module.css';
import { AiDashboardVisualization } from './AiDashboardVisualization';
import { ChatElementsUtils } from './utils';
import { ViewSqlButton } from './ViewSqlButton';

type ArtifactRef = {
    projectUuid: string;
    agentUuid: string;
    artifactUuid: string;
    versionUuid: string;
    messageUuid: string;
    threadUuid: string;
};

type AiArtifactPanelProps = {
    artifact: ArtifactRef;
    showCloseButton?: boolean;
    /** `floating` = new chromeless floating card (default).
     *  `inline`   = legacy inline rendering for admin views. */
    variant?: 'floating' | 'inline';
};

export const AiArtifactPanel: FC<AiArtifactPanelProps> = memo(
    ({ artifact, showCloseButton = true, variant = 'floating' }) => {
        const dispatch = useAiAgentStoreDispatch();
        const {
            data: artifactData,
            isLoading: isArtifactLoading,
            error: artifactError,
        } = useAiAgentArtifact({
            projectUuid: artifact.projectUuid,
            agentUuid: artifact.agentUuid,
            artifactUuid: artifact.artifactUuid,
            versionUuid: artifact.versionUuid,
        });

        const { data: thread } = useAiAgentThread(
            artifact.projectUuid,
            artifact.agentUuid,
            artifact.threadUuid,
        );

        const message = useMemo(
            () =>
                thread?.messages.find(
                    (msg) =>
                        msg.role === 'assistant' &&
                        msg.uuid === artifact.messageUuid,
                ) as AiAgentMessageAssistant | undefined,
            [thread?.messages, artifact.messageUuid],
        );

        // Controlled chart-type state so we can render the floating pill.
        const [selectedChartType, setSelectedChartType] =
            useState<AiAgentChartTypeOption | undefined>(undefined);

        // For the chrome action row: compiled SQL needs queryExecutionHandle,
        // which lives inside AiChartVisualization. We fetch it here too so
        // the chrome can show ViewSqlButton + QuickOptions without prop-drilling.
        const queryExecutionHandle = useAiAgentArtifactVizQuery(
            {
                projectUuid: artifact.projectUuid,
                agentUuid: artifact.agentUuid,
                artifactUuid: artifact.artifactUuid,
                versionUuid: artifact.versionUuid,
            },
            { enabled: variant === 'floating' && !!artifactData?.chartConfig },
        );

        const { data: compiledSql } = useCompiledSqlFromMetricQuery({
            tableName:
                queryExecutionHandle?.data?.query.metricQuery?.exploreName,
            projectUuid: artifact.projectUuid,
            metricQuery: queryExecutionHandle?.data?.query.metricQuery,
        });

        const layoutId = `ai-artifact-${artifact.artifactUuid}-${artifact.versionUuid}`;

        if (isArtifactLoading || !message) {
            return (
                <Box
                    {...ChatElementsUtils.centeredElementProps}
                    p="md"
                    className={
                        variant === 'floating' ? styles.floatingPanel : undefined
                    }
                >
                    <Center className={styles.loading}>
                        <Loader
                            type="dots"
                            color="gray"
                            delayedMessage="Loading artifact..."
                        />
                    </Center>
                </Box>
            );
        }

        const isError =
            artifactError ||
            !artifactData ||
            (artifactData.artifactType === 'dashboard' &&
                !artifactData.dashboardConfig) ||
            (artifactData.artifactType === 'chart' && !artifactData.chartConfig);

        if (isError) {
            return (
                <Box {...ChatElementsUtils.centeredElementProps} p="md">
                    <Stack gap="xs" align="center" justify="center">
                        <MantineIcon
                            icon={IconExclamationCircle}
                            color="gray"
                        />
                        <Text size="xs" c="dimmed" ta="center">
                            Failed to load artifact. Please try again.
                        </Text>
                    </Stack>
                </Box>
            );
        }

        // Dashboards: keep current rendering — out of scope for v2 chrome.
        if (artifactData.artifactType === 'dashboard') {
            return (
                <Box {...ChatElementsUtils.centeredElementProps} p="md">
                    <Stack gap="md" h="100%">
                        <AiDashboardVisualization
                            artifactData={artifactData}
                            projectUuid={artifact.projectUuid}
                            agentUuid={artifact.agentUuid}
                            dashboardConfig={artifactData.dashboardConfig!}
                            message={message}
                            showCloseButton={showCloseButton}
                        />
                    </Stack>
                </Box>
            );
        }

        // Inline variant (admin verified-content view): no morph wrapper, no
        // floating pill, original chrome.
        if (variant === 'inline') {
            return (
                <Box {...ChatElementsUtils.centeredElementProps} p="md">
                    <Stack gap="md" h="100%">
                        <AiChartVisualization
                            artifactData={artifactData}
                            projectUuid={artifact.projectUuid}
                            agentUuid={artifact.agentUuid}
                            artifactUuid={artifact.artifactUuid}
                            versionUuid={artifact.versionUuid}
                            message={message}
                            showCloseButton={showCloseButton}
                        />
                    </Stack>
                </Box>
            );
        }

        // Floating variant: chromeless head + floating chart-type pill.
        const title =
            queryExecutionHandle.data?.metadata.title ?? 'Untitled chart';
        const description =
            queryExecutionHandle.data?.metadata.description ?? null;

        return (
            <LayoutGroup>
                <motion.div layoutId={layoutId} className={styles.floatingPanel}>
                    <div className={styles.floatingInner}>
                        <div className={styles.head}>
                            <Text className={styles.title}>{title}</Text>
                            {description && (
                                <Tooltip
                                    label={description}
                                    multiline
                                    w={260}
                                    withinPortal
                                >
                                    <MantineIcon
                                        icon={IconInfoCircle}
                                        size="sm"
                                        color="ldGray.6"
                                    />
                                </Tooltip>
                            )}
                            <Box style={{ flex: 1 }} />
                            <Group gap={4} className={styles.headRight}>
                                <ViewSqlButton sql={compiledSql?.query} />
                                <AiChartQuickOptions
                                    message={message}
                                    projectUuid={artifact.projectUuid}
                                    agentUuid={artifact.agentUuid}
                                    artifactData={artifactData}
                                    saveChartOptions={{
                                        name: title,
                                        description: description ?? undefined,
                                        linkToMessage: true,
                                    }}
                                    compiledSql={compiledSql?.query}
                                />
                                {showCloseButton && (
                                    <ActionIcon
                                        size="sm"
                                        variant="subtle"
                                        color="ldGray.6"
                                        onClick={() =>
                                            dispatch(clearArtifact())
                                        }
                                        aria-label="Close"
                                    >
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                )}
                            </Group>
                        </div>

                        <div className={styles.body}>
                            <AiChartVisualization
                                artifactData={artifactData}
                                projectUuid={artifact.projectUuid}
                                agentUuid={artifact.agentUuid}
                                artifactUuid={artifact.artifactUuid}
                                versionUuid={artifact.versionUuid}
                                message={message}
                                showCloseButton={false}
                                showInlineHeader={false}
                                controlledChartType={selectedChartType}
                                onControlledChartTypeChange={
                                    setSelectedChartType
                                }
                            />
                            {queryExecutionHandle.data &&
                                selectedChartType !== undefined &&
                                (() => {
                                    const metricQuery =
                                        queryExecutionHandle.data.query
                                            .metricQuery;
                                    if (!metricQuery) return null;
                                    return (
                                        <Box className={styles.floatingPill}>
                                            <AgentVisualizationChartTypeSwitcher
                                                metricQuery={metricQuery}
                                                selectedChartType={
                                                    selectedChartType
                                                }
                                                hasGroupByDimensions={
                                                    metricQuery.metrics
                                                        ?.length > 0
                                                }
                                                onChartTypeChange={
                                                    setSelectedChartType
                                                }
                                            />
                                        </Box>
                                    );
                                })()}
                        </div>
                    </div>
                </motion.div>
            </LayoutGroup>
        );
    },
);
```

**Note on the floating pill state coupling.** The pill only renders once the user has interacted (when `selectedChartType !== undefined`). Until then, the chart uses its default type (driven inside `AiVisualizationRenderer` from `defaultChartType`). For v2 we want the pill visible from the start. To do that, initialize `selectedChartType` from the artifact's default type once `queryExecutionHandle.data` is available:

```tsx
const defaultChartType = queryExecutionHandle.data?.metadata?.defaultChartType;
useEffect(() => {
    if (selectedChartType === undefined && defaultChartType) {
        setSelectedChartType(defaultChartType);
    }
}, [defaultChartType, selectedChartType]);
```

Add the import `import { useEffect } from 'react';` if not present.

If `metadata.defaultChartType` doesn't exist on `ApiAiAgentThreadMessageVizQuery`, fall back to inspecting `artifactData.chartConfig` (the field that drives the default in `AiVisualizationRenderer` — search for `defaultChartType` in that file to confirm).

- [ ] **Step 3: Typecheck + lint**

Run:
```bash
pnpm -F frontend typecheck 2>&1 | tail -30 && pnpm -F frontend lint 2>&1 | tail -10
```

If typecheck fails on `metadata.defaultChartType` not existing, swap to whatever path the existing renderer uses (grep `defaultChartType` in `AiVisualizationRenderer.tsx`).

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiArtifactPanel.tsx packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiArtifactPanel.module.css
git commit -m "$(cat <<'EOF'
feat(ai): floating chromeless artifact panel with morph + pill toolbar

Rewrites AiArtifactPanel as a chromeless floating card: single-row head
with title + info tooltip + action icons + close, body hosting the chart
with the inline header suppressed, and a dark pill at the bottom-center
holding the chart-type switcher.

The panel is wrapped in motion.div layoutId so it morphs from the
AiArtifactButton in the chat thread when opened.

A `variant` prop preserves the legacy inline rendering for the admin
verified-content view (AiArtifactInline).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `AiArtifactInline` keeps the legacy chrome

**Files:**
- Modify: `packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiArtifactInline.tsx`

The admin/verified-content view embeds `AiArtifactPanel` inside a bordered `Paper`. For v2 it should keep the old chrome (the floating treatment doesn't fit inside a 400 px tile). Pass `variant="inline"`.

- [ ] **Step 1: Patch the existing render**

Find the two `<AiArtifactPanel ...>` usages in `AiArtifactInline.tsx`. Each is rendered with `showCloseButton={false}`. Add `variant="inline"`:

```tsx
<AiArtifactPanel
    artifact={{
        artifactUuid: artifact.artifactUuid,
        versionUuid: artifact.versionUuid,
        messageUuid: message.uuid,
        threadUuid: message.threadUuid,
        projectUuid: projectUuid,
        agentUuid: agentUuid,
    }}
    showCloseButton={false}
    variant="inline"
/>
```

(The file has it twice — once for charts in a `Paper`, once for dashboards in a `Box`. Update both call sites.)

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
pnpm -F frontend typecheck 2>&1 | tail -10 && pnpm -F frontend lint 2>&1 | tail -10
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/ee/features/aiCopilot/components/ChatElements/AiArtifactInline.tsx
git commit -m "$(cat <<'EOF'
chore(ai): keep AiArtifactInline on legacy chrome via variant

The admin verified-content view embeds AiArtifactPanel inside a small
bordered Paper. The new floating chrome doesn't make sense there;
variant=inline preserves the legacy rendering.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Swap the right Panel in `AiAgentPageLayout` for the floating region

**Files:**
- Modify: `packages/frontend/src/ee/features/aiCopilot/components/AiAgentPageLayout/AiAgentPageLayout.tsx`
- Modify: `packages/frontend/src/ee/features/aiCopilot/components/AiAgentPageLayout/aiAgentPageLayout.module.css`

Replace the right `react-resizable-panels` `Panel` (and its resize handle) with a div that takes 50% of the workspace width, with 12 px padding on top/bottom/right. The chat column gets the rest. Wrap the whole workspace in `<LayoutGroup>` so the morph can connect the chat-thread button to the floating panel.

Mobile keeps the existing `<Drawer>` path unchanged.

- [ ] **Step 1: Add CSS for the floating region**

Append to `packages/frontend/src/ee/features/aiCopilot/components/AiAgentPageLayout/aiAgentPageLayout.module.css`:

```css
.floatingArtifactRegion {
    flex: 0 0 50%;
    min-width: 420px;
    max-width: 50vw;
    padding: var(--mantine-spacing-md) var(--mantine-spacing-md)
        var(--mantine-spacing-md) 0;
    min-height: 0;
    display: flex;
}

.floatingArtifactRegion > * {
    flex: 1;
    min-height: 0;
}

.workspace {
    display: flex;
    flex: 1;
    min-height: 0;
}

.workspace .chatPanelWrap {
    flex: 1;
    min-width: 0;
}
```

- [ ] **Step 2: Rewrite `AiAgentPageLayout.tsx`**

Replace the file. The key changes:
1. Drop the artifact-side `Panel`/`PanelResizeHandle`.
2. Render the chat side inside a `<Panel>` that fills the remaining width (the sidebar Panel stays).
3. After the `<PanelGroup>`, render a sibling `<div>` for the floating artifact region with the new CSS class. Both live inside a `<LayoutGroup>` wrapper.

Replace lines 77–191 (the entire return block) with:

```tsx
return (
    <LayoutGroup>
        <div
            className={styles.workspace}
            style={{ height: `calc(100vh - ${NAVBAR_HEIGHT}px)` }}
        >
            <PanelGroup
                direction="horizontal"
                className={styles.panelGroup}
                style={{ flex: 1, minWidth: 0 }}
            >
                {Sidebar && (
                    <Fragment>
                        <ErrorBoundary>
                            <Panel
                                id="sidebar"
                                ref={sidebarPanelRef}
                                defaultSize={20}
                                minSize={10}
                                maxSize={40}
                                collapsible
                                className={`${styles.sidebar} ${
                                    !isResizing ? styles.sidebarTransition : ''
                                }`}
                                onCollapse={() =>
                                    setIsAgentSidebarCollapsed?.(true)
                                }
                                onExpand={() =>
                                    setIsAgentSidebarCollapsed?.(false)
                                }
                            >
                                <Flex justify="flex-end">
                                    <SidebarButton
                                        size="sm"
                                        leftSection={
                                            <MantineIcon
                                                size="md"
                                                icon={
                                                    isAgentSidebarCollapsed
                                                        ? IconLayoutSidebarLeftExpand
                                                        : IconLayoutSidebarLeftCollapse
                                                }
                                                stroke={1.8}
                                                color="ldGray.7"
                                            />
                                        }
                                        onClick={toggleSidebar}
                                    />
                                </Flex>
                                {Sidebar}
                            </Panel>
                        </ErrorBoundary>

                        <PanelResizeHandle
                            className={styles.resizeHandle}
                            onDragging={(isDragging) =>
                                setIsResizing(isDragging)
                            }
                        />
                    </Fragment>
                )}

                <ErrorBoundary>
                    <Panel
                        className={styles.chat}
                        id="chat"
                        minSize={25}
                    >
                        {Header && (
                            <Box className={styles.chatHeader}>{Header}</Box>
                        )}
                        <Box className={styles.chatContent}>{children}</Box>
                    </Panel>
                </ErrorBoundary>
            </PanelGroup>

            {!isMobile && artifact && (
                <ErrorBoundary>
                    <div className={styles.floatingArtifactRegion}>
                        <AiArtifactPanel artifact={artifact} />
                    </div>
                </ErrorBoundary>
            )}

            {isMobile && (
                <Drawer
                    opened={!!artifact}
                    onClose={() => dispatch(clearArtifact())}
                    size="75%"
                    position="bottom"
                    h="75%"
                    withCloseButton={false}
                    transitionProps={{
                        transition: 'slide-up',
                        duration: 200,
                        timingFunction: 'ease-out',
                    }}
                    styles={{
                        body: {
                            padding: 0,
                            paddingBottom: 'var(--mantine-spacing-lg)',
                            height: '100%',
                        },
                    }}
                >
                    {artifact && <AiArtifactPanel artifact={artifact} />}
                </Drawer>
            )}
        </div>
    </LayoutGroup>
);
```

Add the new imports at the top of the file:

```tsx
import { LayoutGroup } from 'motion/react';
```

Remove `artifactPanelRef` and the `useLayoutEffect` that auto-expanded/collapsed the artifact Panel (no longer needed — the floating region is just conditionally rendered).

Remove the import of `ImperativePanelHandle` if it's now unused (TypeScript will tell us).

- [ ] **Step 3: Typecheck + lint**

Run:
```bash
pnpm -F frontend typecheck 2>&1 | tail -30 && pnpm -F frontend lint 2>&1 | tail -10
```

Expected: passes. Fix any unused-import warnings flagged by lint.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/ee/features/aiCopilot/components/AiAgentPageLayout/AiAgentPageLayout.tsx packages/frontend/src/ee/features/aiCopilot/components/AiAgentPageLayout/aiAgentPageLayout.module.css
git commit -m "$(cat <<'EOF'
feat(ai): floating artifact region in AiAgentPageLayout

Replaces the react-resizable-panels artifact column with a floating
region (12 px margin, fixed 50% width). Wraps the workspace in motion's
LayoutGroup so the AiArtifactButton can morph into the new floating panel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Manual smoke test

**Files:** none modified — verification only.

- [ ] **Step 1: Confirm dev server is up**

Per repo CLAUDE.md: assume the dev server is always running. Open `http://localhost:8080` (or whatever port the user's local instance uses).

- [ ] **Step 2: Sign in as the demo user**

Use `demo@lightdash.com` / `demo_password!`. Navigate to an AI agent thread that has at least one chart artifact.

- [ ] **Step 3: Visual checks (golden path)**

Confirm:
- [ ] The artifact panel sits to the right with a clear gutter on top, bottom, and right (no longer flush to the edges).
- [ ] The card has rounded corners and a soft shadow; no hard seam against the chat column.
- [ ] The header is a single ~44 px row: title (truncates with ellipsis when long), info tooltip if there is a description, ViewSqlButton, action menu, close (×). No big description block, no chart-type icons in the header.
- [ ] The chart-type switcher renders as a dark pill floating at the bottom-center of the panel, not inside the chart area.
- [ ] Click the `AiArtifactButton` in a chat message → it morphs into the floating panel.
- [ ] Click ×, or click the same button again, → the panel morphs back into the chat-thread button.
- [ ] In dark mode (toggle via system theme or settings) the panel uses dark surfaces, the pill stays dark, and contrast looks right.

- [ ] **Step 4: Edge-case checks**

- [ ] Scroll the chat so the source button is offscreen, then click ×. The panel should morph to its now-offscreen target (visually flies off-frame); acceptable. No console errors.
- [ ] Spam-click the button twice in quick succession. No console errors; the panel ends in a consistent state.
- [ ] Click a *different* chart artifact button while a panel is already open. The current panel closes, the new one opens. (Motion may animate via the second layoutId; if it teleports instead of morphing, note this as a follow-up — not a blocker.)
- [ ] On mobile width (resize the viewport below 768 px) the bottom-up `<Drawer>` opens as before; no floating region appears.

- [ ] **Step 5: Run repo-level lint + typecheck one more time**

Run:
```bash
pnpm -F frontend typecheck && pnpm -F frontend lint
```

Expected: both pass.

- [ ] **Step 6: Run existing unit tests for the package**

Run:
```bash
pnpm -F frontend test 2>&1 | tail -30
```

Expected: same pass/fail count as before the branch (no new failures). If tests for chart-type switcher or visualization renderer break because of the controlled prop changes from Tasks 3–4, update the test assertions to match the new behavior.

- [ ] **Step 7: Final commit (only if Steps 5–6 surface any small fixes)**

If there are no fixes needed, this step is a no-op.

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix(ai): adjust tests for controlled chart-type prop

Tests touched: <list>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review (post-write)

| Spec section | Plan task |
|---|---|
| Approved direction (spatial / chrome / motion) | Task 5 (panel), Task 7 (layout), Task 2 (button) |
| `motion` dep + bundle | Task 1 |
| Direct replacement, no flag | All tasks (no flag wiring anywhere) |
| `AiArtifactButton` layoutId source | Task 2 |
| `AiArtifactPanel` v2 chrome + variant prop | Task 5 |
| `AiArtifactInline` keeps inline variant | Task 6 |
| Header content mapping (title / info / icons / close + floating pill) | Task 5 |
| Workspace `LayoutGroup` | Task 5 (inner) + Task 7 (outer) — note: Task 7's LayoutGroup is the outer that connects button↔panel across the workspace; Task 5's is removed in cleanup (see below). |
| `react-resizable-panels` not used for artifact column | Task 7 |
| Verified-state badge (small green Badge by title) | **Gap.** Not directly covered in the rewrite. See addendum below. |
| Inner content fade-in coordinated with morph | Task 5 (component opacity uses motion defaults; further polish if needed) |
| Risks: rapid toggling, offscreen source, LayoutGroup cost | Task 8 covers them as smoke checks |

**Internal-consistency cleanup before execution:**

- Task 5 wraps `<motion.div layoutId={...}>` in its own `<LayoutGroup>`. Task 7 also wraps the entire workspace in `<LayoutGroup>`. Two nested LayoutGroups is fine — the outer one in Task 7 is what connects the button and the panel; the inner one in Task 5 is **unnecessary** and should be removed. When implementing Task 5, drop the `<LayoutGroup>` wrapper inside the panel — the outer one in `AiAgentPageLayout` does the work.
- The verified-state Badge from the spec is not in any task. Add it as a small `Badge` after the title in the chromeless head (Task 5), only when `artifactData.is_verified` is truthy. Look up the actual field name in the artifact schema during Task 5 — if it isn't surfaced on the read API yet, defer to a follow-up and note it in the PR description.

**Recommendation:** before starting Task 5, grep the artifact schema for `verified` to see what field name to use. If unsure, ship without the badge and add it in a follow-up — the rest of the chrome is more important.

---

## Out of scope (deferred)

- Dashboard artifact chrome.
- Inline-variant chrome polish (admin verified-content view).
- Verified-state Badge if the field isn't on the read API yet.
- Mobile-drawer polish to match the new chrome.
