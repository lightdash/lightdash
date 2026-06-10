import { CiCheckState, type CiCheck } from '@lightdash/common';
import { type DefaultMantineColor, Group, Loader, Text } from '@mantine-8/core';
import {
    IconCircleCheck,
    IconCircleMinus,
    IconCircleX,
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

const StateIcon: FC<{ state: CiCheckState }> = ({ state }) => {
    const { color, icon } = STATE_STYLE[state];
    if (icon === null) {
        return <Loader size={14} color={color} />;
    }
    return <MantineIcon icon={icon} size={14} color={color} />;
};

const CheckItem: FC<{ check: CiCheck }> = ({ check }) => (
    <PolymorphicGroupButton
        component="a"
        href={check.url ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        gap={6}
        wrap="nowrap"
        className={styles.checkItem}
    >
        <StateIcon state={check.state} />
        <Text size="xs" fw={500} c="default">
            {check.name}
        </Text>
        <Text size="xs" c="dimmed">
            {STATE_STYLE[check.state].label}
        </Text>
    </PolymorphicGroupButton>
);

/**
 * Inline CI status for a write-back PR: one subtle, clickable item per check
 * (linking to its run on the provider), with the status icon carrying the only
 * colour. Renders nothing while loading, when CI can't be resolved, or when the
 * ref has no checks — so the PR card stays clean for projects without CI.
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
        <Group gap="xs" wrap="wrap">
            {ciChecks.checks.map((check) => (
                <CheckItem key={check.name} check={check} />
            ))}
        </Group>
    );
};
