import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ManagedAgentActionType,
    ManagedAgentRunStatus,
    type ManagedAgentRun,
} from '@lightdash/common';
import { Button, HoverCard } from '@mantine-8/core';
import {
    IconArrowRight,
    IconChartBar,
    IconShieldCheck,
    IconTarget,
    IconTrendingUp,
} from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { lightdashApi } from '../../api';
import { useManagedAgentLatestRun } from '../../ee/features/managedAgent/hooks/useManagedAgentLatestRun';
import { useManagedAgentSettings } from '../../ee/features/managedAgent/hooks/useManagedAgentSettings';
import { ManagedAgentSetupModal } from '../../ee/features/managedAgent/ManagedAgentSetupModal';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import classes from './AutopilotNavButton.module.css';

const resumeSettings = async (projectUuid: string, schedule: string) =>
    lightdashApi({
        url: `/projects/${projectUuid}/managed-agent/settings`,
        method: 'PATCH',
        body: JSON.stringify({ enabled: true, schedule }),
    });

type Props = {
    projectUuid: string;
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

const CAPABILITIES = [
    { icon: IconShieldCheck, label: 'Fixes broken charts' },
    { icon: IconTrendingUp, label: 'Flags stale content' },
    { icon: IconChartBar, label: 'Creates fresh visualizations' },
];

/**
 * Autopilot cell in the primary nav group, right after Ask AI. Always a plain
 * icon button (no hover-expand) — the hovercards below carry the explanation
 * instead. Managers only, gated on the AiAutopilot flag.
 *
 * - Never configured: hovering opens a promo card; clicking opens the setup
 *   modal.
 * - Configured but disabled: same card, but clicking resumes it directly
 *   (PATCHes the existing settings row back to enabled) rather than
 *   navigating away.
 * - Active: hovering opens a compact status card (status, last-run action
 *   summary, link to the full activity page).
 */
export const AutopilotNavButton = ({ projectUuid }: Props) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
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

    const [setupOpen, setSetupOpen] = useState(false);

    const goToAutopilot = () =>
        void navigate(`/projects/${projectUuid}/autopilot`);

    const resumeMutation = useMutation({
        mutationFn: () => resumeSettings(projectUuid, settings!.schedule),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: ['managed-agent-settings', projectUuid],
            });
        },
    });

    if (!active) return null;

    if (!isEnabled) {
        // A settings row already exists (it was configured before, just
        // switched off) — resume it directly. No row yet — walk them
        // through the setup modal first.
        const hasExistingSettings = !!settings;
        const handleCellClick = hasExistingSettings
            ? () => resumeMutation.mutate()
            : () => setSetupOpen(true);

        return (
            <HoverCard
                width={280}
                shadow="xl"
                position="bottom-start"
                offset={8}
                openDelay={120}
                closeDelay={80}
                withinPortal
                portalProps={{ target: '#navbar-header' }}
            >
                <HoverCard.Target>
                    <Button
                        size="xs"
                        variant="default"
                        classNames={{
                            root: classes.cell,
                            label: classes.cellLabel,
                        }}
                        onClick={handleCellClick}
                        loading={resumeMutation.isLoading}
                        aria-label={
                            hasExistingSettings
                                ? 'Resume Autopilot'
                                : 'Set up Autopilot'
                        }
                    >
                        <MantineIcon
                            icon={IconTarget}
                            size={16}
                            color="dimmed"
                        />
                    </Button>
                </HoverCard.Target>
                <HoverCard.Dropdown className={classes.promoDropdown}>
                    <div className={classes.promo}>
                        <div className={classes.promoHeader}>
                            <div className={classes.promoTitle}>Autopilot</div>
                            <div className={classes.promoTagline}>
                                Your project, kept sharp and current.
                            </div>
                        </div>
                        <div className={classes.promoFeatures}>
                            {CAPABILITIES.map((feature) => (
                                <div
                                    key={feature.label}
                                    className={classes.promoFeature}
                                >
                                    <MantineIcon
                                        icon={feature.icon}
                                        size={15}
                                        className={classes.promoFeatureIcon}
                                    />
                                    <span>{feature.label}</span>
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            className={classes.promoCta}
                            onClick={handleCellClick}
                            disabled={resumeMutation.isLoading}
                        >
                            {resumeMutation.isLoading
                                ? 'Resuming…'
                                : hasExistingSettings
                                  ? 'Resume Autopilot'
                                  : 'Set up Autopilot'}
                            <MantineIcon icon={IconArrowRight} size={14} />
                        </button>
                    </div>
                </HoverCard.Dropdown>
                <ManagedAgentSetupModal
                    projectUuid={projectUuid}
                    opened={setupOpen}
                    onClose={() => setSetupOpen(false)}
                    onEnabled={() => {
                        setSetupOpen(false);
                        goToAutopilot();
                    }}
                />
            </HoverCard>
        );
    }

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
            shadow="xl"
            position="bottom-start"
            offset={8}
            openDelay={120}
            closeDelay={80}
            withinPortal
            portalProps={{ target: '#navbar-header' }}
        >
            <HoverCard.Target>
                <Button
                    size="xs"
                    variant="default"
                    classNames={{
                        root: classes.cell,
                        label: classes.cellLabel,
                    }}
                    onClick={goToAutopilot}
                    aria-label="Autopilot"
                >
                    <span className={classes.iconWrap}>
                        <MantineIcon icon={IconTarget} size={16} />
                        <span
                            className={`${classes.dotCorner} ${dotClass}`}
                            aria-hidden="true"
                        />
                    </span>
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
