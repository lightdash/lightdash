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

const MERGE_LATENCY_MS = 1200;
const CLOSE_LATENCY_MS = 1000;

const makeCiChecks = (overrides: Partial<CiChecks>): CiChecks => ({
    provider: CiProviderType.GITHUB,
    overall: CiCheckState.FAILURE,
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
                            Merge failed — the button reset, try again.
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

export const InteractiveMergeFlow: Story = {
    render: () => <InteractiveDemo />,
};

export const MergeFails: Story = {
    render: () => <InteractiveDemo failMerge />,
};

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

export const MergeableWithFailingCheck: Story = {
    render: () => <CardShell ciChecks={makeCiChecks({})} />,
};

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

export const MergeConflicts: Story = {
    render: () => (
        <CardShell
            ciChecks={makeCiChecks({ mergeState: CiMergeState.CONFLICTS })}
        />
    ),
};

export const Merged: Story = {
    render: () => <CardShell ciChecks={makeCiChecks({ merged: true })} />,
};

export const Closed: Story = {
    render: () => <CardShell ciChecks={makeCiChecks({ state: 'closed' })} />,
};

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
