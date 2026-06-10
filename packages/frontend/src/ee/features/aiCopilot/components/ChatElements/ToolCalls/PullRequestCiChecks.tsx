import { CiCheckState, CiMergeState, type CiCheck } from '@lightdash/common';
import {
    Anchor,
    Box,
    type DefaultMantineColor,
    Group,
    Loader,
    Paper,
    Progress,
    Stack,
    Text,
    ThemeIcon,
} from '@mantine-8/core';
import {
    IconAlertTriangle,
    IconBrandGithub,
    IconCircleCheck,
    IconCircleMinus,
    IconCircleX,
    IconClock,
    IconPlayerSkipForward,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../../../../../components/common/PolymorphicGroupButton';
import { usePullRequestCiChecks } from '../../../hooks/usePullRequestCiChecks';
import styles from './PullRequestCiChecks.module.css';

type StateStyle = {
    color: DefaultMantineColor;
    icon: TablerIcon | null; // null → render a spinner (pending)
    label: string;
};

// Provider-agnostic state → colour/icon/label. Keeps the UI host-neutral: a
// GitLab pipeline mapped onto the same CiCheckState renders identically. Only
// the status icon carries colour — names stay neutral so the table reads calmly.
const STATE_STYLE: Record<CiCheckState, StateStyle> = {
    [CiCheckState.SUCCESS]: {
        color: 'green',
        icon: IconCircleCheck,
        label: 'passed',
    },
    [CiCheckState.FAILURE]: {
        color: 'red',
        icon: IconCircleX,
        label: 'failed',
    },
    [CiCheckState.PENDING]: { color: 'yellow', icon: null, label: 'running' },
    [CiCheckState.CANCELLED]: {
        color: 'ldGray.6',
        icon: IconCircleMinus,
        label: 'cancelled',
    },
    [CiCheckState.SKIPPED]: {
        color: 'ldGray.6',
        icon: IconPlayerSkipForward,
        label: 'skipped',
    },
    [CiCheckState.NEUTRAL]: {
        color: 'ldGray.6',
        icon: IconCircleMinus,
        label: 'neutral',
    },
};

// Merge verdict (from the repo's policy) → the readiness banner. This is the
// authoritative signal, not the CI roll-up: a failing non-required check is
// UNSTABLE (still mergeable), not BLOCKED.
const READINESS: Record<
    CiMergeState,
    {
        color: DefaultMantineColor;
        icon: TablerIcon;
        title: string;
        hint: string;
    }
> = {
    [CiMergeState.READY]: {
        color: 'green',
        icon: IconCircleCheck,
        title: 'Ready to merge',
        hint: 'All required checks and reviews have passed',
    },
    [CiMergeState.UNSTABLE]: {
        color: 'yellow',
        icon: IconAlertTriangle,
        title: 'Mergeable',
        hint: 'Some checks are failing, but none are required to merge',
    },
    [CiMergeState.BLOCKED]: {
        color: 'red',
        icon: IconCircleX,
        title: 'Merge blocked',
        hint: 'A required check or review has not passed',
    },
    [CiMergeState.CONFLICTS]: {
        color: 'red',
        icon: IconAlertTriangle,
        title: 'Merge conflicts',
        hint: 'Resolve conflicts with the base branch before merging',
    },
    [CiMergeState.BEHIND]: {
        color: 'yellow',
        icon: IconClock,
        title: 'Out of date',
        hint: 'Update the branch with its base before merging',
    },
    [CiMergeState.DRAFT]: {
        color: 'ldGray.6',
        icon: IconCircleMinus,
        title: 'Draft',
        hint: 'Mark the pull request ready for review to merge',
    },
    [CiMergeState.UNKNOWN]: {
        color: 'ldGray.6',
        icon: IconClock,
        title: 'Checking merge status…',
        hint: 'Evaluating the repository’s merge requirements',
    },
};

const StateIcon: FC<{ state: CiCheckState }> = ({ state }) => {
    const { color, icon } = STATE_STYLE[state];
    if (icon === null) {
        return <Loader size={14} color={color} />;
    }
    return <MantineIcon icon={icon} size={14} color={color} />;
};

// The segmented pass/fail/pending bar (Graphite-style). Each state gets a
// section sized by its share of the checks; pending is striped+animated to
// read as "in progress".
const ChecksBar: FC<{ checks: CiCheck[] }> = ({ checks }) => {
    const total = checks.length;
    const share = (state: CiCheckState) =>
        (checks.filter((c) => c.state === state).length / total) * 100;
    const passed = share(CiCheckState.SUCCESS);
    const failed = share(CiCheckState.FAILURE);
    const pending = share(CiCheckState.PENDING);
    const neutral = 100 - passed - failed - pending;
    return (
        <Progress.Root size="sm" radius="xl">
            <Progress.Section value={passed} color="green" />
            <Progress.Section value={failed} color="red" />
            <Progress.Section value={pending} color="yellow" striped animated />
            <Progress.Section value={neutral} color="gray" />
        </Progress.Root>
    );
};

const CheckRow: FC<{ check: CiCheck }> = ({ check }) => (
    <PolymorphicGroupButton
        component="a"
        href={check.url ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        gap="xs"
        wrap="nowrap"
        className={styles.row}
    >
        <MantineIcon icon={IconBrandGithub} size={14} color="ldGray.7" />
        <Text
            size="xs"
            fw={500}
            c="foreground"
            truncate
            className={styles.name}
        >
            {check.name}
        </Text>
        <StateIcon state={check.state} />
    </PolymorphicGroupButton>
);

const ReadinessBanner: FC<{ mergeState: CiMergeState }> = ({ mergeState }) => {
    const { color, icon, title, hint } = READINESS[mergeState];
    return (
        <Paper withBorder radius="sm" p="xs">
            <Group gap="xs" wrap="nowrap">
                <ThemeIcon variant="light" color={color} radius="xl" size="md">
                    <MantineIcon icon={icon} size={16} />
                </ThemeIcon>
                <Stack gap={0}>
                    <Text size="sm" fw={600} c={color}>
                        {title}
                    </Text>
                    <Text size="xs" c="dimmed">
                        {hint}
                    </Text>
                </Stack>
            </Group>
        </Paper>
    );
};

/**
 * CI status for a write-back PR, in the style of a code-review tool's merge
 * box: a segmented pass/fail/pending bar, a per-check table linking to each
 * run, and a roll-up merge-readiness banner. Renders nothing while loading,
 * when CI can't be resolved, or when the ref has no checks — so the PR card
 * stays clean for projects without CI.
 */
export const PullRequestCiChecks: FC<{
    projectUuid: string;
    prUrl: string;
}> = ({ projectUuid, prUrl }) => {
    const { data: ciChecks } = usePullRequestCiChecks(projectUuid, prUrl);

    if (!ciChecks || ciChecks.checks.length === 0) {
        return null;
    }

    return (
        <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap">
                <Group gap={6} wrap="nowrap">
                    <Text size="xs" fw={600} c="foreground">
                        Checks
                    </Text>
                    <Text size="xs" c="dimmed">
                        {ciChecks.checks.length}
                    </Text>
                </Group>
                <Anchor
                    href={`${prUrl}/checks`}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="xs"
                >
                    View all
                </Anchor>
            </Group>

            <ChecksBar checks={ciChecks.checks} />

            <Box className={styles.table}>
                {ciChecks.checks.map((check) => (
                    <CheckRow key={check.name} check={check} />
                ))}
            </Box>

            <ReadinessBanner mergeState={ciChecks.mergeState} />
        </Stack>
    );
};
