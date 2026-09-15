import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ManagedAgentActionType,
    ManagedAgentRunStatus,
    type ManagedAgentRun,
} from '@lightdash/common';
import { Button, HoverCard } from '@mantine/core';
import { IconArrowRight, IconTarget } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { useManagedAgentLatestRun } from '../../ee/features/managedAgent/hooks/useManagedAgentLatestRun';
import { useManagedAgentSettings } from '../../ee/features/managedAgent/hooks/useManagedAgentSettings';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import classes from './AutopilotNavButton.module.css';
import { useNavBarPortalTarget } from './NavBarPortalContext';

type Props = {
    projectUuid: string;
    withLabel?: boolean;
};

const formatRelative = (dateInput: Date | string) => {
    const diff = Date.now() - new Date(dateInput).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
};

const summarizeActionCounts = (
    counts: ManagedAgentRun['actionCountsByType'] | undefined,
): string | null => {
    if (!counts) return null;
    const parts: string[] = [];
    if (counts[ManagedAgentActionType.FIXED_BROKEN])
        parts.push(`${counts[ManagedAgentActionType.FIXED_BROKEN]} fixed`);
    if (counts[ManagedAgentActionType.CREATED_CONTENT])
        parts.push(`${counts[ManagedAgentActionType.CREATED_CONTENT]} created`);
    if (counts[ManagedAgentActionType.FLAGGED_STALE])
        parts.push(`${counts[ManagedAgentActionType.FLAGGED_STALE]} flagged`);
    if (counts[ManagedAgentActionType.SOFT_DELETED])
        parts.push(`${counts[ManagedAgentActionType.SOFT_DELETED]} deleted`);
    return parts.length > 0 ? parts.join(' · ') : null;
};

/**
 * Active Autopilot status in the primary nav, gated by feature flag,
 * permissions and project settings. Setup remains on the project homepage.
 */
export const AutopilotNavButton = ({
    projectUuid,
    withLabel = false,
}: Props) => {
    const portalTarget = useNavBarPortalTarget();
    const navigate = useNavigate();
    const { user } = useApp();
    const canManage =
        user.data?.ability?.can(
            'manage',
            subject('AiAgent', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        ) ?? false;
    const { data: aiAutopilotFlag } = useServerFeatureFlag(
        FeatureFlags.AiAutopilot,
    );
    const active = !!aiAutopilotFlag?.enabled && canManage;

    const { data: settings } = useManagedAgentSettings({ enabled: active });
    const isEnabled = settings?.enabled ?? false;
    const { data: latestRun } = useManagedAgentLatestRun({
        enabled: active && isEnabled,
    });

    const goToAutopilot = () =>
        void navigate(`/projects/${projectUuid}/autopilot`);

    if (!active) return null;
    if (!isEnabled) return null;

    const running = latestRun?.status === ManagedAgentRunStatus.STARTED;
    const failed = latestRun?.status === ManagedAgentRunStatus.ERROR;
    const dotClass = failed ? classes.dotFailed : classes.dotActive;

    let statusText: string;
    if (running) {
        statusText = latestRun?.currentActivity ?? 'Working…';
    } else if (failed) {
        statusText = 'Last run failed';
    } else if (latestRun) {
        const count = latestRun.actionCount;
        statusText = `${count} action${count === 1 ? '' : 's'} · ${formatRelative(
            latestRun.finishedAt ?? latestRun.startedAt,
        )}`;
    } else {
        statusText = 'Monitoring your project';
    }

    const actionSummary = summarizeActionCounts(latestRun?.actionCountsByType);

    return (
        <HoverCard
            width={240}
            position="bottom-start"
            offset={8}
            openDelay={120}
            closeDelay={80}
            portalProps={{ target: portalTarget }}
        >
            <HoverCard.Target>
                <Button
                    size="xs"
                    variant="default"
                    classNames={{
                        root: classes.cell,
                        label: classes.cellLabel,
                    }}
                    leftSection={
                        <span className={classes.iconWrap}>
                            <MantineIcon icon={IconTarget} size={16} />
                            <span
                                className={`${classes.dotCorner} ${dotClass}`}
                                aria-hidden="true"
                            />
                        </span>
                    }
                    onClick={goToAutopilot}
                    aria-label="Autopilot"
                >
                    {withLabel && 'Autopilot'}
                </Button>
            </HoverCard.Target>
            <HoverCard.Dropdown className={classes.promoDropdown}>
                <button
                    type="button"
                    className={classes.miniCard}
                    onClick={goToAutopilot}
                >
                    <div className={classes.miniHeaderText}>
                        <span className={classes.promoTitle}>Autopilot</span>
                        <span
                            className={`${classes.miniStatusDot} ${dotClass}`}
                            aria-hidden="true"
                        />
                    </div>
                    <div className={classes.miniStatus}>{statusText}</div>
                    {actionSummary && !running && (
                        <div className={classes.miniSummary}>
                            {actionSummary}
                        </div>
                    )}
                    <div className={classes.miniFooter}>
                        View activity
                        <MantineIcon icon={IconArrowRight} size={12} />
                    </div>
                </button>
            </HoverCard.Dropdown>
        </HoverCard>
    );
};
