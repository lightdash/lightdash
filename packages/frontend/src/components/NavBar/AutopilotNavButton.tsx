import { subject } from '@casl/ability';
import { FeatureFlags, ManagedAgentRunStatus } from '@lightdash/common';
import { Button, HoverCard } from '@mantine-8/core';
import {
    IconArrowRight,
    IconChartBar,
    IconShieldCheck,
    IconTarget,
    IconTrendingUp,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useManagedAgentLatestRun } from '../../ee/features/managedAgent/hooks/useManagedAgentLatestRun';
import { useManagedAgentSettings } from '../../ee/features/managedAgent/hooks/useManagedAgentSettings';
import { ManagedAgentSetupModal } from '../../ee/features/managedAgent/ManagedAgentSetupModal';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import classes from './AutopilotNavButton.module.css';

type Props = {
    projectUuid: string;
};

const CAPABILITIES = [
    { icon: IconShieldCheck, label: 'Fixes broken charts' },
    { icon: IconTrendingUp, label: 'Flags stale content' },
    { icon: IconChartBar, label: 'Creates fresh visualizations' },
];

/**
 * Autopilot cell in the primary nav group, right after Ask AI. Icon-only (target
 * glyph + status dot) until hovered, then it expands to reveal the label —
 * present but quiet. Managers only, gated on the AiAutopilot flag. When it isn't
 * set up yet, hovering opens a promo card explaining what it does; clicking opens
 * the setup modal directly (first time) or jumps to /autopilot to resume (a
 * settings row already exists, just switched off).
 */
export const AutopilotNavButton = ({ projectUuid }: Props) => {
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

    const [setupOpen, setSetupOpen] = useState(false);

    const goToAutopilot = () =>
        void navigate(`/projects/${projectUuid}/autopilot`);

    if (!active) return null;

    if (!isEnabled) {
        // A settings row already exists (it was configured before, just
        // switched off) — resuming just needs the toggle on /autopilot.
        // No row yet — walk them through the setup modal first.
        const hasExistingSettings = !!settings;
        const handleCellClick = hasExistingSettings
            ? goToAutopilot
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
                        px={10}
                        onClick={handleCellClick}
                        aria-label={
                            hasExistingSettings
                                ? 'Resume Autopilot'
                                : 'Set up Autopilot'
                        }
                    >
                        <MantineIcon icon={IconTarget} size={16} color="dimmed" />
                    </Button>
                </HoverCard.Target>
                <HoverCard.Dropdown className={classes.promoDropdown}>
                    <div className={classes.promo}>
                        <div className={classes.promoHeader}>
                            <span className={classes.promoOrb}>
                                <MantineIcon icon={IconTarget} size={18} />
                            </span>
                            <div>
                                <div className={classes.promoTitle}>
                                    Autopilot
                                </div>
                                <div className={classes.promoTagline}>
                                    Your project, kept sharp and current.
                                </div>
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
                        >
                            {hasExistingSettings
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

    const failed = latestRun?.status === ManagedAgentRunStatus.ERROR;
    const dotClass = failed ? classes.dotFailed : classes.dotActive;

    return (
        <Button
            size="xs"
            variant="default"
            px={10}
            onClick={goToAutopilot}
            aria-label="Autopilot"
            title={`Autopilot · ${failed ? 'run failed' : 'active'}`}
        >
            <span className={classes.iconWrap}>
                <MantineIcon icon={IconTarget} size={16} />
                <span
                    className={`${classes.dotCorner} ${dotClass}`}
                    aria-hidden="true"
                />
            </span>
        </Button>
    );
};
