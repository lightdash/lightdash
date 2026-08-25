import { getAppDisplayName } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Text,
    Title,
    Tooltip,
    VisuallyHidden,
} from '@mantine/core';
import {
    IconChevronLeft,
    IconHistory,
    IconInfoCircle,
    IconPencil,
    IconSparkles,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import AppUpdateModal from '../../../components/common/modal/AppUpdateModal';
import AppUpgradeModal from '../../../features/apps/components/AppUpgradeModal';
import { type SdkUpgradeOffer } from '../../../features/apps/hooks/useSdkUpgradeStatus';
import { type ChartTypeAppMeta } from '../../../features/chartTypes/builder/appMeta';
import MantineIcon from '../../common/MantineIcon';
import { authoringStatusLabel, type AuthoringStatus } from './authoringStatus';
import classes from './ExplorerChartTypeAuthoringHeader.module.css';

type Props = {
    projectUuid: string;
    titleId: string;
    /** Null while no app exists yet (a new type before its first build). */
    app: ChartTypeAppMeta | null;
    status: AuthoringStatus | null;
    upgrade: (SdkUpgradeOffer & { disabled: boolean }) | null;
    hasHistory: boolean;
    isHistoryOpen: boolean;
    /** The host's results-staleness warning; renders nothing while clean. */
    warning: ReactNode;
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
    upgrade,
    hasHistory,
    isHistoryOpen,
    warning,
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
    const headingText = app ? `Editing chart type · ${title}` : title;

    // Entering replaces what had focus; land on what this surface is.
    const titleRef = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        titleRef.current?.focus();
    }, []);

    return (
        <Group className={classes.header} gap="sm" wrap="nowrap">
            <Button
                size="xs"
                variant="default"
                leftSection={<MantineIcon icon={IconChevronLeft} size={15} />}
                onClick={onDone}
            >
                Back to chart
            </Button>
            <Box className={classes.divider} />
            <Box className={classes.nameCluster}>
                <Title
                    ref={titleRef}
                    id={titleId}
                    order={2}
                    className={classes.title}
                    fz="sm"
                    fw={600}
                    title={headingText}
                    tabIndex={-1}
                >
                    {app && (
                        <Text span fz="sm" fw={400} c="dimmed">
                            {'Editing chart type · '}
                        </Text>
                    )}
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
            </Box>
            <VisuallyHidden role="status">
                {status ? authoringStatusLabel(status) : ''}
            </VisuallyHidden>
            <Group className={classes.actions} gap="xs" wrap="nowrap">
                {warning}
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
                    <Button
                        size="xs"
                        variant={isHistoryOpen ? 'light' : 'default'}
                        color="gray"
                        leftSection={
                            <MantineIcon icon={IconHistory} size={15} />
                        }
                        aria-pressed={isHistoryOpen}
                        onClick={onToggleHistory}
                    >
                        History
                    </Button>
                )}
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
