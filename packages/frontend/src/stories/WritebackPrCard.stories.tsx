import {
    CiCheckState,
    CiMergeState,
    CiProviderType,
    type CiChecks,
} from '@lightdash/common';
import { Box, Button, Group, Paper, Stack, Text } from '@mantine-8/core';
import '@mantine-8/core/styles.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type FC, type ReactNode } from 'react';
import { PullRequestActionButtons } from '../ee/features/aiCopilot/components/ChatElements/ToolCalls/AiEditDbtProjectToolCall';
import styles from '../ee/features/aiCopilot/components/ChatElements/ToolCalls/AiEditDbtProjectToolCall.module.css';
import { PullRequestCiChecks } from '../ee/features/aiCopilot/components/ChatElements/ToolCalls/PullRequestCiChecks';
import Mantine8Provider from '../providers/Mantine8Provider';

const DEMO_PR_URL = 'https://github.com/charliedowler/jaffle/pull/1';

// Realistic-ish provider latency so the arm → confirm → loading → terminal
// transition feels like the real flow, without raising a real pull request.
const MERGE_LATENCY_MS = 1200;
const CLOSE_LATENCY_MS = 1000;

const makeCiChecks = (overrides: Partial<CiChecks>): CiChecks => ({
    provider: CiProviderType.GITHUB,
    overall: CiCheckState.FAILURE,
    // UNSTABLE = mergeable but a non-required check is failing (matches the
    // "1 failing check" the writeback demo repo produces).
    mergeState: CiMergeState.UNSTABLE,
    merged: false,
    state: 'open',
    checks: [
        { name: 'noop-success', state: CiCheckState.SUCCESS, url: null },
        { name: 'noop-failure', state: CiCheckState.FAILURE, url: null },
        { name: 'noop-pending', state: CiCheckState.PENDING, url: null },
    ],
    ...overrides,
});

// Mirrors the card's class logic in AiEditDbtProjectToolCall: merged → violet
// hue + shimmer, closed → red hue, otherwise plain.
const cardClassName = (ciChecks: CiChecks) =>
    ciChecks.merged
        ? `${styles.card} ${styles.cardMerged}`
        : ciChecks.state === 'closed'
          ? `${styles.card} ${styles.cardClosed}`
          : styles.card;

const CardShell: FC<{
    ciChecks: CiChecks;
    isMerging?: boolean;
    isClosing?: boolean;
    onMerge?: () => void;
    onClose?: () => void;
    footer?: ReactNode;
}> = ({
    ciChecks,
    isMerging = false,
    isClosing = false,
    onMerge,
    onClose,
    footer,
}) => (
    <Stack gap="md" w={560} p="md">
        <Paper
            withBorder
            p="sm"
            radius="md"
            className={cardClassName(ciChecks)}
        >
            <Stack gap="xs">
                <Group justify="space-between" align="center" wrap="nowrap">
                    <Stack gap={0}>
                        <Text size="sm" fw={500}>
                            Edited semantic layer
                        </Text>
                        <Text size="xs" c="ldGray.6">
                            charliedowler/jaffle · 4c2a4e9
                        </Text>
                    </Stack>
                    <Box className={styles.actions}>
                        <PullRequestActionButtons
                            ciChecks={ciChecks}
                            isMerging={isMerging}
                            isClosing={isClosing}
                            onMerge={onMerge ?? (() => {})}
                            onClose={onClose ?? (() => {})}
                        />
                    </Box>
                </Group>
                <PullRequestCiChecks
                    prUrl={DEMO_PR_URL}
                    ciChecks={ciChecks}
                    hasMergeAction
                />
            </Stack>
        </Paper>
        {footer}
    </Stack>
);

/**
 * Self-contained, backend-free harness for the merge/close interaction: inline
 * confirm, loading, the terminal hue (+ shimmer + confetti on merge), and the
 * failure path. Stubbed mutations resolve on a timer.
 */
const InteractiveDemo: FC<{ failMerge?: boolean }> = ({
    failMerge = false,
}) => {
    const [outcome, setOutcome] = useState<'open' | 'merged' | 'closed'>(
        'open',
    );
    const [isMerging, setIsMerging] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [failed, setFailed] = useState(false);

    const ciChecks = makeCiChecks(
        outcome === 'merged'
            ? { merged: true }
            : outcome === 'closed'
              ? { state: 'closed' }
              : {},
    );

    const handleMerge = () => {
        setFailed(false);
        setIsMerging(true);
        window.setTimeout(() => {
            setIsMerging(false);
            if (failMerge) {
                setFailed(true);
            } else {
                setOutcome('merged');
            }
        }, MERGE_LATENCY_MS);
    };

    const handleClose = () => {
        setIsClosing(true);
        window.setTimeout(() => {
            setIsClosing(false);
            setOutcome('closed');
        }, CLOSE_LATENCY_MS);
    };

    const reset = () => {
        setOutcome('open');
        setIsMerging(false);
        setIsClosing(false);
        setFailed(false);
    };

    return (
        <CardShell
            ciChecks={ciChecks}
            isMerging={isMerging}
            isClosing={isClosing}
            onMerge={handleMerge}
            onClose={handleClose}
            footer={
                <Group gap="md">
                    <Button variant="subtle" w="fit-content" onClick={reset}>
                        Reset to open
                    </Button>
                    {failed && (
                        <Text size="sm" c="red.6">
                            Merge failed — the button reset, try again. (In the
                            app a toast surfaces the error.)
                        </Text>
                    )}
                </Group>
            }
        />
    );
};

const meta: Meta = {
    title: 'AI Copilot/WritebackPrCard',
    decorators: [
        (renderStory) => <Mantine8Provider>{renderStory()}</Mantine8Provider>,
    ],
};

export default meta;

type Story = StoryObj;

/**
 * Click **Merge PR** → it morphs to **Confirm ✓**, click again → ~1.2s loading
 * → the card flips to the purple merged state (hue + shimmer) and confetti
 * fires from the button. **Close PR** works the same way (red, no celebration).
 * Use **Reset** to replay.
 */
export const InteractiveMergeFlow: Story = {
    render: () => <InteractiveDemo />,
};

/** The merge request errors: loading clears and the button resets to "Merge PR" — no merged hue, no confetti. */
export const MergeFails: Story = {
    render: () => <InteractiveDemo failMerge />,
};

/** Ready to merge — all checks pass; the roll-up shows just the check summary (the button conveys "mergeable"). */
export const ReadyToMerge: Story = {
    render: () => (
        <CardShell
            ciChecks={makeCiChecks({
                overall: CiCheckState.SUCCESS,
                mergeState: CiMergeState.READY,
                checks: [
                    { name: 'build', state: CiCheckState.SUCCESS, url: null },
                    { name: 'test', state: CiCheckState.SUCCESS, url: null },
                ],
            })}
        />
    ),
};

/** Mergeable but a non-required check is failing — merge stays enabled; no redundant "Mergeable" title. */
export const MergeableWithFailingCheck: Story = {
    render: () => <CardShell ciChecks={makeCiChecks({})} />,
};

/** Checks still running — mergeability not yet known, merge disabled, title kept. */
export const ChecksRunning: Story = {
    render: () => (
        <CardShell
            ciChecks={makeCiChecks({
                overall: CiCheckState.PENDING,
                mergeState: CiMergeState.UNKNOWN,
                checks: [
                    { name: 'build', state: CiCheckState.PENDING, url: null },
                    { name: 'test', state: CiCheckState.PENDING, url: null },
                ],
            })}
        />
    ),
};

/** Blocked by branch protection — merge disabled, the title explains why. */
export const MergeBlocked: Story = {
    render: () => (
        <CardShell
            ciChecks={makeCiChecks({
                overall: CiCheckState.FAILURE,
                mergeState: CiMergeState.BLOCKED,
            })}
        />
    ),
};

/** Merge conflicts — disabled, title kept. */
export const MergeConflicts: Story = {
    render: () => (
        <CardShell
            ciChecks={makeCiChecks({ mergeState: CiMergeState.CONFLICTS })}
        />
    ),
};

/** Terminal merged state — purple hue + shimmer, "Merged" marker. */
export const Merged: Story = {
    render: () => <CardShell ciChecks={makeCiChecks({ merged: true })} />,
};

/** Terminal closed-without-merge state — red hue, no shimmer, "Closed" marker. */
export const Closed: Story = {
    render: () => <CardShell ciChecks={makeCiChecks({ state: 'closed' })} />,
};

/** No CI configured — the roll-up row is omitted entirely, leaving just the actions. */
export const NoCiConfigured: Story = {
    render: () => (
        <CardShell
            ciChecks={makeCiChecks({
                overall: CiCheckState.NEUTRAL,
                mergeState: CiMergeState.READY,
                checks: [],
            })}
        />
    ),
};
