import { CiCheckState, CiMergeState, type CiCheck } from '@lightdash/common';
import {
    Anchor,
    Box,
    Collapse,
    Group,
    Loader,
    Stack,
    Text,
    UnstyledButton,
    type DefaultMantineColor,
} from '@mantine-8/core';
import {
    IconAlertTriangle,
    IconBrandGithub,
    IconChevronRight,
    IconCircleCheck,
    IconCircleMinus,
    IconCircleX,
    IconClock,
    IconPlayerSkipForward,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
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
// the status icon carries colour — names stay neutral so the row reads calmly.
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

// Merge verdict (from the repo's policy) → icon/colour for the single roll-up
// row. This is the authoritative signal, not the CI roll-up: a failing
// non-required check is UNSTABLE (still mergeable), not BLOCKED. Colour lives
// only in this 14px icon — no banner, no fill — to keep the card discreet.
const READINESS: Record<
    CiMergeState,
    {
        color: DefaultMantineColor;
        icon: TablerIcon | null; // null → spinner (still evaluating)
        title: string;
    }
> = {
    [CiMergeState.READY]: {
        color: 'green',
        icon: IconCircleCheck,
        title: 'Ready to merge',
    },
    [CiMergeState.UNSTABLE]: {
        color: 'yellow',
        icon: IconAlertTriangle,
        title: 'Mergeable',
    },
    [CiMergeState.BLOCKED]: {
        color: 'red',
        icon: IconCircleX,
        title: 'Merge blocked',
    },
    [CiMergeState.CONFLICTS]: {
        color: 'red',
        icon: IconAlertTriangle,
        title: 'Merge conflicts',
    },
    [CiMergeState.BEHIND]: {
        color: 'yellow',
        icon: IconClock,
        title: 'Out of date',
    },
    [CiMergeState.DRAFT]: {
        color: 'ldGray.6',
        icon: IconCircleMinus,
        title: 'Draft',
    },
    [CiMergeState.UNKNOWN]: {
        color: 'ldGray.6',
        icon: null,
        title: 'Checking merge status',
    },
};

const StateIcon: FC<{ state: CiCheckState }> = ({ state }) => {
    const { color, icon } = STATE_STYLE[state];
    if (icon === null) {
        return <Loader size={14} color={color} />;
    }
    return <MantineIcon icon={icon} size={14} color={color} />;
};

// One quiet phrase describing the checks at a glance, prioritising whatever
// needs attention: failures first, then in-flight runs, else "all passed".
const summariseChecks = (checks: CiCheck[]): string => {
    const count = (state: CiCheckState) =>
        checks.filter((c) => c.state === state).length;
    const failed = count(CiCheckState.FAILURE);
    const pending = count(CiCheckState.PENDING);
    if (failed > 0) {
        return `${failed} failing check${failed > 1 ? 's' : ''}`;
    }
    if (pending > 0) {
        return `${pending} check${pending > 1 ? 's' : ''} running`;
    }
    return `All ${checks.length} checks passed`;
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

/**
 * CI status for a write-back PR, distilled to a single Codex-style roll-up row:
 * a small merge-readiness icon, the verdict, and a one-line check summary, with
 * the per-check list tucked behind a disclosure. No segmented bar, no coloured
 * banner — colour lives only in the status icons. Renders nothing while
 * loading, when CI can't be resolved, or when the ref has no checks, so the PR
 * card stays clean for projects without CI.
 */
export const PullRequestCiChecks: FC<{
    projectUuid: string;
    prUrl: string;
    /** Pins the checks to this card's own commit; null falls back to PR head. */
    commitSha: string | null;
}> = ({ projectUuid, prUrl, commitSha }) => {
    const { data: ciChecks } = usePullRequestCiChecks(
        projectUuid,
        prUrl,
        commitSha,
    );
    const [expanded, setExpanded] = useState(false);

    if (!ciChecks || ciChecks.checks.length === 0) {
        return null;
    }

    const { color, icon, title } = READINESS[ciChecks.mergeState];

    return (
        <Stack gap={4}>
            <Group justify="space-between" wrap="nowrap" gap="xs">
                <UnstyledButton
                    className={styles.summary}
                    onClick={() => setExpanded((v) => !v)}
                >
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon
                            icon={IconChevronRight}
                            size={14}
                            color="ldGray.6"
                            className={
                                expanded ? styles.chevronOpen : styles.chevron
                            }
                        />
                        {icon === null ? (
                            <Loader size={14} color={color} />
                        ) : (
                            <MantineIcon icon={icon} size={14} color={color} />
                        )}
                        <Text size="xs" fw={600} c="foreground">
                            {title}
                        </Text>
                        <Text size="xs" c="dimmed">
                            · {summariseChecks(ciChecks.checks)}
                        </Text>
                    </Group>
                </UnstyledButton>
                <Anchor
                    href={`${prUrl}/checks`}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="xs"
                    c="dimmed"
                >
                    View all
                </Anchor>
            </Group>

            <Collapse in={expanded}>
                <Box className={styles.table}>
                    {ciChecks.checks.map((check) => (
                        <CheckRow key={check.name} check={check} />
                    ))}
                </Box>
            </Collapse>
        </Stack>
    );
};
