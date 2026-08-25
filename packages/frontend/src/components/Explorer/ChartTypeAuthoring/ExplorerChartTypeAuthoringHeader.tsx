import {
    getAppDisplayName,
    type ApiAppVersionSummary,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Title,
    Tooltip,
    VisuallyHidden,
} from '@mantine/core';
import {
    IconHistory,
    IconInfoCircle,
    IconPencil,
    IconSparkles,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import AppUpdateModal from '../../../components/common/modal/AppUpdateModal';
import AppUpgradeModal from '../../../features/apps/components/AppUpgradeModal';
import { type SdkUpgradeOffer } from '../../../features/apps/hooks/useSdkUpgradeStatus';
import { getVersionAuthorName } from '../../../features/apps/utils/versionsToChatMessages';
import VersionProvenance from '../../../features/chartTypes/builder/VersionProvenance';
import MantineIcon from '../../common/MantineIcon';
import { authoringStatusLabel, type AuthoringStatus } from './authoringStatus';
import classes from './ExplorerChartTypeAuthoringHeader.module.css';

type Props = {
    projectUuid: string;
    titleId: string;
    /** Null while no app exists yet (a new type before its first build). */
    app: { appUuid: string; name: string; description: string } | null;
    status: AuthoringStatus | null;
    /** The version the provenance line reports; null while history is empty. */
    provenanceVersion: ApiAppVersionSummary | null;
    /** Whether `provenanceVersion` really is the origin (v1 is loaded). */
    hasOrigin: boolean;
    upgrade: (SdkUpgradeOffer & { disabled: boolean }) | null;
    hasHistory: boolean;
    isHistoryOpen: boolean;
    /** The host's run-query control; null when no query backs the session. */
    runQuery: ReactNode;
    onToggleHistory: () => void;
    onUpgradeStarted: () => void;
    onDetailsSaved: () => void;
    onDone: () => void;
};

const ExplorerChartTypeAuthoringHeader: FC<Props> = ({
    projectUuid,
    titleId,
    app,
    status,
    provenanceVersion,
    hasOrigin,
    upgrade,
    hasHistory,
    isHistoryOpen,
    runQuery,
    onToggleHistory,
    onUpgradeStarted,
    onDetailsSaved,
    onDone,
}) => {
    const [isEditingDetails, setIsEditingDetails] = useState(false);
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
    const upgradeAvailable =
        upgrade?.status === 'stale' || upgrade?.status === 'legacy';
    const title = app
        ? getAppDisplayName(app.name, app.appUuid)
        : 'New chart type';

    // Entering replaces what had focus; land on what this surface is.
    const titleRef = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        titleRef.current?.focus();
    }, []);

    return (
        <Group className={classes.header} gap="sm" wrap="nowrap">
            <Box className={classes.nameCluster}>
                <Title
                    ref={titleRef}
                    id={titleId}
                    order={2}
                    className={classes.title}
                    fz="sm"
                    fw={600}
                    title={title}
                    tabIndex={-1}
                >
                    {title}
                </Title>
                {app && app.description && (
                    <Tooltip
                        withArrow
                        multiline
                        w={280}
                        label={app.description}
                        position="bottom"
                    >
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label="Chart type description"
                        >
                            <MantineIcon icon={IconInfoCircle} />
                        </ActionIcon>
                    </Tooltip>
                )}
                {app && (
                    <Tooltip label="Edit details" position="bottom">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label="Edit chart type details"
                            onClick={() => setIsEditingDetails(true)}
                        >
                            <MantineIcon icon={IconPencil} />
                        </ActionIcon>
                    </Tooltip>
                )}
                {provenanceVersion && (
                    <VersionProvenance
                        className={classes.provenance}
                        authorName={getVersionAuthorName(provenanceVersion)}
                        at={new Date(provenanceVersion.createdAt)}
                        isOrigin={hasOrigin}
                    />
                )}
            </Box>
            <VisuallyHidden role="status">
                {status ? authoringStatusLabel(status) : ''}
            </VisuallyHidden>
            <Group className={classes.actions} gap="xs" wrap="nowrap">
                {runQuery}
                {upgradeAvailable && (
                    <Button
                        size="compact-sm"
                        variant="light"
                        leftSection={<MantineIcon icon={IconSparkles} />}
                        disabled={upgrade.disabled}
                        onClick={() => setIsUpgradeModalOpen(true)}
                    >
                        Upgrade available
                    </Button>
                )}
                {hasHistory && (
                    <Tooltip label="Version history" position="bottom">
                        <ActionIcon
                            variant={isHistoryOpen ? 'light' : 'subtle'}
                            color="gray"
                            size="md"
                            aria-label="Version history"
                            aria-pressed={isHistoryOpen}
                            onClick={onToggleHistory}
                        >
                            <MantineIcon icon={IconHistory} />
                        </ActionIcon>
                    </Tooltip>
                )}
                <Button size="compact-sm" onClick={onDone}>
                    Done
                </Button>
            </Group>
            {app && isEditingDetails && (
                <AppUpdateModal
                    opened
                    onClose={() => setIsEditingDetails(false)}
                    onConfirm={() => {
                        setIsEditingDetails(false);
                        onDetailsSaved();
                    }}
                    projectUuid={projectUuid}
                    uuid={app.appUuid}
                    initialName={title}
                    initialDescription={app.description}
                    resourceLabel="Chart Type"
                    icon={IconPencil}
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
        </Group>
    );
};

export default ExplorerChartTypeAuthoringHeader;
