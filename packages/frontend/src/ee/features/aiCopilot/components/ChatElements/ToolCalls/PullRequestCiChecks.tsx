import { CiCheckState, type CiCheck } from '@lightdash/common';
import {
    Anchor,
    Badge,
    type DefaultMantineColor,
    Group,
    Loader,
    Text,
} from '@mantine-8/core';
import {
    IconCircleCheck,
    IconCircleMinus,
    IconCircleX,
    IconPlayerSkipForward,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { usePullRequestCiChecks } from '../../../hooks/usePullRequestCiChecks';

type StateStyle = {
    color: DefaultMantineColor;
    icon: TablerIcon | null; // null → render a spinner (pending)
    label: string;
};

// Provider-agnostic state → colour/icon/label. Keeps the UI host-neutral: a
// GitLab pipeline mapped onto the same CiCheckState renders identically.
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
        color: 'gray',
        icon: IconCircleMinus,
        label: 'cancelled',
    },
    [CiCheckState.SKIPPED]: {
        color: 'gray',
        icon: IconPlayerSkipForward,
        label: 'skipped',
    },
    [CiCheckState.NEUTRAL]: {
        color: 'gray',
        icon: IconCircleMinus,
        label: 'neutral',
    },
};

const StateIcon: FC<{ state: CiCheckState }> = ({ state }) => {
    const { color, icon } = STATE_STYLE[state];
    if (icon === null) {
        return <Loader size={12} color={color} />;
    }
    return <MantineIcon icon={icon} size={12} color={color} />;
};

const CheckChip: FC<{ check: CiCheck }> = ({ check }) => {
    const { color, label } = STATE_STYLE[check.state];
    const badge = (
        <Badge
            variant="light"
            color={color}
            radius="sm"
            tt="none"
            fw={500}
            leftSection={<StateIcon state={check.state} />}
        >
            {check.name}
            <Text span inherit c="dimmed" ml={4}>
                {label}
            </Text>
        </Badge>
    );

    return check.url ? (
        <Anchor
            href={check.url}
            target="_blank"
            rel="noopener noreferrer"
            underline="never"
        >
            {badge}
        </Anchor>
    ) : (
        badge
    );
};

/**
 * Inline CI status for a write-back PR: one state-tinted, clickable chip per
 * check (linking to its run on the provider). Renders nothing while loading,
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
        <Group gap="xs" wrap="wrap">
            {ciChecks.checks.map((check) => (
                <CheckChip key={check.name} check={check} />
            ))}
        </Group>
    );
};
