import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ManagedAgentActionType,
    ManagedAgentRunStatus,
    type ManagedAgentRun,
} from '@lightdash/common';
import { Button, HoverCard } from '@mantine/core';
import {
    IconArrowRight,
    IconChartBar,
    IconShieldCheck,
    IconTarget,
    IconTrendingUp,
} from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { lightdashApi } from '../../api';
import { useManagedAgentLatestRun } from '../../ee/features/managedAgent/hooks/useManagedAgentLatestRun';
import { useManagedAgentSettings } from '../../ee/features/managedAgent/hooks/useManagedAgentSettings';
import { ManagedAgentSetupModal } from '../../ee/features/managedAgent/ManagedAgentSetupModal';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import AppColorSchemeScope from './AppColorSchemeScope';
import classes from './AutopilotNavButton.module.css';
import { useNavBarPortalTarget } from './NavBarPortalContext';

const resumeSettings = async (projectUuid: string, schedule: string) =>
    lightdashApi({
        url: `/projects/${projectUuid}/managed-agent/settings`,
        method: 'PATCH',
        body: JSON.stringify({ enabled: true, schedule }),
    });

type Props = {
    projectUuid: string;
    withLabel?: boolean;
};

const formatRelative = (
    t: TFunction<'navigation'>,
    dateInput: Date | string,
) => {
    const diff = Date.now() - new Date(dateInput).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('autopilot.relative.justNow');
    if (mins < 60) return t('autopilot.relative.minutesAgo', { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('autopilot.relative.hoursAgo', { count: hours });
    return t('autopilot.relative.daysAgo', {
        count: Math.floor(hours / 24),
    });
};

const summarizeActionCounts = (
    t: TFunction<'navigation'>,
    counts: ManagedAgentRun['actionCountsByType'] | undefined,
): string | null => {
    if (!counts) return null;
    const parts: string[] = [];
    if (counts[ManagedAgentActionType.FIXED_BROKEN])
        parts.push(
            t('autopilot.summary.fixed', {
                count: counts[ManagedAgentActionType.FIXED_BROKEN],
            }),
        );
    if (counts[ManagedAgentActionType.CREATED_CONTENT])
        parts.push(
            t('autopilot.summary.created', {
                count: counts[ManagedAgentActionType.CREATED_CONTENT],
            }),
        );
    if (counts[ManagedAgentActionType.FLAGGED_STALE])
        parts.push(
            t('autopilot.summary.flagged', {
                count: counts[ManagedAgentActionType.FLAGGED_STALE],
            }),
        );
    if (counts[ManagedAgentActionType.SOFT_DELETED])
        parts.push(
            t('autopilot.summary.deleted', {
                count: counts[ManagedAgentActionType.SOFT_DELETED],
            }),
        );
    return parts.length > 0 ? parts.join(' · ') : null;
};

const CAPABILITIES = [
    { icon: IconShieldCheck, labelKey: 'autopilot.capabilities.fixesBroken' },
    { icon: IconTrendingUp, labelKey: 'autopilot.capabilities.flagsStale' },
    {
        icon: IconChartBar,
        labelKey: 'autopilot.capabilities.createsVisualizations',
    },
];

/**
 * Autopilot setup, resume and status in the primary nav, gated by feature
 * flag, permissions and project settings.
 */
export const AutopilotNavButton = ({
    projectUuid,
    withLabel = false,
}: Props) => {
    const { t } = useTranslation('navigation');
    const portalTarget = useNavBarPortalTarget();
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
        const hasExistingSettings = !!settings;
        const actionLabel = hasExistingSettings
            ? t('autopilot.resume')
            : t('autopilot.setUp');
        const handleCellClick = hasExistingSettings
            ? () => resumeMutation.mutate()
            : () => setSetupOpen(true);

        return (
            <HoverCard
                width={280}
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
                        data-icon-only={!withLabel || undefined}
                        classNames={{
                            root: classes.cell,
                            label: classes.cellLabel,
                            section: classes.cellSection,
                        }}
                        leftSection={
                            <MantineIcon
                                icon={IconTarget}
                                size={16}
                                color="dimmed"
                            />
                        }
                        onClick={handleCellClick}
                        loading={resumeMutation.isLoading}
                        aria-label={actionLabel}
                    >
                        {withLabel && actionLabel}
                    </Button>
                </HoverCard.Target>
                <HoverCard.Dropdown className={classes.promoDropdown}>
                    <div className={classes.promo}>
                        <div className={classes.promoHeader}>
                            <div className={classes.promoTitle}>
                                {t('autopilot.label')}
                            </div>
                            <div className={classes.promoTagline}>
                                {t('autopilot.tagline')}
                            </div>
                        </div>
                        <div className={classes.promoFeatures}>
                            {CAPABILITIES.map((feature) => (
                                <div
                                    key={feature.labelKey}
                                    className={classes.promoFeature}
                                >
                                    <MantineIcon
                                        icon={feature.icon}
                                        size={15}
                                        className={classes.promoFeatureIcon}
                                    />
                                    <span>{t(feature.labelKey)}</span>
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
                                ? t('autopilot.resuming')
                                : actionLabel}
                            <MantineIcon icon={IconArrowRight} size={14} />
                        </button>
                    </div>
                </HoverCard.Dropdown>
                <AppColorSchemeScope>
                    <ManagedAgentSetupModal
                        projectUuid={projectUuid}
                        opened={setupOpen}
                        onClose={() => setSetupOpen(false)}
                        onEnabled={() => {
                            setSetupOpen(false);
                            goToAutopilot();
                        }}
                    />
                </AppColorSchemeScope>
            </HoverCard>
        );
    }

    const running = latestRun?.status === ManagedAgentRunStatus.STARTED;
    const failed = latestRun?.status === ManagedAgentRunStatus.ERROR;
    const dotClass = failed ? classes.dotFailed : classes.dotActive;

    let statusText: string;
    if (running) {
        statusText = latestRun?.currentActivity ?? t('autopilot.working');
    } else if (failed) {
        statusText = t('autopilot.lastRunFailed');
    } else if (latestRun) {
        statusText = t('autopilot.actionsStatus', {
            count: latestRun.actionCount,
            time: formatRelative(
                t,
                latestRun.finishedAt ?? latestRun.startedAt,
            ),
        });
    } else {
        statusText = t('autopilot.monitoring');
    }

    const actionSummary = summarizeActionCounts(
        t,
        latestRun?.actionCountsByType,
    );

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
                    data-icon-only={!withLabel || undefined}
                    classNames={{
                        root: classes.cell,
                        label: classes.cellLabel,
                        section: classes.cellSection,
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
                    aria-label={t('autopilot.label')}
                >
                    {withLabel && t('autopilot.label')}
                </Button>
            </HoverCard.Target>
            <HoverCard.Dropdown className={classes.promoDropdown}>
                <button
                    type="button"
                    className={classes.miniCard}
                    onClick={goToAutopilot}
                >
                    <div className={classes.miniHeaderText}>
                        <span className={classes.promoTitle}>
                            {t('autopilot.label')}
                        </span>
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
                        {t('autopilot.viewActivity')}
                        <MantineIcon icon={IconArrowRight} size={12} />
                    </div>
                </button>
            </HoverCard.Dropdown>
        </HoverCard>
    );
};
