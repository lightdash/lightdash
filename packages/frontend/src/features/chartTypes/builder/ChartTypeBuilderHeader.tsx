import { getAppDisplayName } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconChevronLeft,
    IconHistory,
    IconInfoCircle,
    IconPencil,
    IconSparkles,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link, type To } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import AppUpdateModal from '../../../components/common/modal/AppUpdateModal';
import AppUpgradeModal from '../../apps/components/AppUpgradeModal';
import ClearAgentContextAction from '../../apps/components/ClearAgentContextAction';
import { type SdkUpgradeOffer } from '../../apps/hooks/useSdkUpgradeStatus';
import { getChartTypeIcon } from '../utils/chartTypeIcons';
import { type ChartTypeAppMeta } from './appMeta';
import classes from './ChartTypeBuilderHeader.module.css';

type Props = {
    projectUuid: string;
    appUuidOrSlug?: string;
    /** A real link (href, middle-click, open in new tab); a page-level
     *  `useBlocker` gates it while a build is running. */
    backLink: {
        label: string;
        to: To;
    };
    /** Runs cleanup for an abandoned type; a no-op while building, since the
     *  blocker's own confirm owns that case instead. */
    onBackLinkClick: () => void;
    /** Null while no app exists yet (create flow before the first build). */
    app: ChartTypeAppMeta | null;
    latestReadyVersion: number | null;
    /** False while the visualization has no versions to look back through. */
    hasHistory: boolean;
    isHistoryOpen: boolean;
    /** Clearing agent context is refused while a build runs. */
    isBuilding: boolean;
    upgrade: (SdkUpgradeOffer & { disabled: boolean }) | null;
    onUpgradeStarted: () => void;
    onToggleHistory: () => void;
    /** Navigates to the gallery; the page's `useBlocker` gates it while a
     *  build is running. */
    onDone: () => void;
    previewInExplorerLink: To | null;
    onPreviewInExplorer: (() => void) | null;
};

const ChartTypeBuilderHeader: FC<Props> = ({
    projectUuid,
    appUuidOrSlug,
    backLink,
    onBackLinkClick,
    app,
    latestReadyVersion,
    hasHistory,
    isHistoryOpen,
    isBuilding,
    upgrade,
    onUpgradeStarted,
    onToggleHistory,
    onDone,
    previewInExplorerLink,
    onPreviewInExplorer,
}) => {
    const [isEditingDetails, setIsEditingDetails] = useState(false);
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
    const upgradeAvailable =
        upgrade?.status === 'stale' || upgrade?.status === 'legacy';
    const hasName = !!app?.name.trim();
    // One filled action: Preview in explorer while it is on offer, Done
    // otherwise (nothing to preview before the first ready version).
    const showPreviewInExplorer =
        latestReadyVersion !== null &&
        (previewInExplorerLink !== null || onPreviewInExplorer !== null);

    return (
        <Box className={classes.header} component="header">
            <Box className={classes.side}>
                <Button
                    size="xs"
                    component={Link}
                    to={backLink.to}
                    variant="default"
                    leftSection={
                        <MantineIcon icon={IconChevronLeft} size={15} />
                    }
                    onClick={(event) => {
                        // A modified click opens a new tab and stays here.
                        if (
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.altKey
                        )
                            return;
                        onBackLinkClick();
                    }}
                >
                    {backLink.label}
                </Button>
                {app && (
                    <>
                        <Text
                            className={classes.studioLabel}
                            fz="sm"
                            fw={600}
                            c="ldGray.8"
                        >
                            Chart Studio
                        </Text>
                        {hasName && <Box className={classes.divider} />}
                        <Box className={classes.nameCluster}>
                            {hasName && (
                                <>
                                    <MantineIcon
                                        icon={getChartTypeIcon(app.icon)}
                                        color="dimmed"
                                    />
                                    <Title
                                        className={classes.name}
                                        order={6}
                                        lineClamp={1}
                                    >
                                        {getAppDisplayName(
                                            app.name,
                                            app.appUuid,
                                        )}
                                    </Title>
                                </>
                            )}
                            {app.description && (
                                <Tooltip w={280} label={app.description}>
                                    <ActionIcon
                                        size="sm"
                                        aria-label="Chart type description"
                                    >
                                        <MantineIcon icon={IconInfoCircle} />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                            <Tooltip label="Edit details">
                                <ActionIcon
                                    size="sm"
                                    aria-label="Edit chart type details"
                                    onClick={() => setIsEditingDetails(true)}
                                >
                                    <MantineIcon icon={IconPencil} />
                                </ActionIcon>
                            </Tooltip>
                        </Box>
                    </>
                )}
            </Box>
            <Group gap="xs" wrap="nowrap">
                {upgradeAvailable && (
                    <Button
                        size="xs"
                        variant="light"
                        color="blue"
                        leftSection={
                            <MantineIcon icon={IconSparkles} size={15} />
                        }
                        disabled={upgrade.disabled}
                        onClick={() => setIsUpgradeModalOpen(true)}
                    >
                        Upgrade available
                    </Button>
                )}
                {app && (
                    <ClearAgentContextAction
                        projectUuid={projectUuid}
                        appUuid={app.appUuid}
                        disabled={isBuilding}
                    />
                )}
                {hasHistory && (
                    <Button
                        size="xs"
                        variant={isHistoryOpen ? 'light' : 'default'}
                        color="gray"
                        leftSection={
                            <MantineIcon icon={IconHistory} size={15} />
                        }
                        onClick={onToggleHistory}
                    >
                        History
                    </Button>
                )}
                <Button
                    size="xs"
                    variant={showPreviewInExplorer ? 'default' : undefined}
                    onClick={onDone}
                >
                    Done
                </Button>
                {showPreviewInExplorer &&
                    (previewInExplorerLink ? (
                        <Button
                            size="xs"
                            component={Link}
                            to={previewInExplorerLink}
                        >
                            Preview in explorer
                        </Button>
                    ) : (
                        onPreviewInExplorer && (
                            <Button size="xs" onClick={onPreviewInExplorer}>
                                Preview in explorer
                            </Button>
                        )
                    ))}
            </Group>
            {app && isEditingDetails && (
                <AppUpdateModal
                    opened
                    onClose={() => setIsEditingDetails(false)}
                    onConfirm={() => setIsEditingDetails(false)}
                    projectUuid={projectUuid}
                    uuid={app.appUuid}
                    appUuidOrSlug={appUuidOrSlug}
                    initialName={getAppDisplayName(app.name, app.appUuid)}
                    initialDescription={app.description}
                    resourceLabel="Chart Type"
                    icon={IconPencil}
                    iconPicker={{ initialIcon: app.icon }}
                />
            )}
            {app && upgrade && isUpgradeModalOpen && (
                <AppUpgradeModal
                    opened
                    onClose={() => setIsUpgradeModalOpen(false)}
                    projectUuid={projectUuid}
                    appUuid={app.appUuid}
                    offer={upgrade}
                    resource="chartType"
                    onStarted={onUpgradeStarted}
                />
            )}
        </Box>
    );
};

export default ChartTypeBuilderHeader;
