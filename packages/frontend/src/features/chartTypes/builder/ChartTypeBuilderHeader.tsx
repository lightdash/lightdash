import {
    getAppDisplayName,
    type ApiAppVersionSummary,
} from '@lightdash/common';
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
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import AppUpdateModal from '../../../components/common/modal/AppUpdateModal';
import { getVersionAuthorName } from '../../apps/utils/versionsToChatMessages';
import classes from './ChartTypeBuilderHeader.module.css';
import VersionProvenance from './VersionProvenance';

type Props = {
    projectUuid: string;
    /** Null while no app exists yet (create flow before the first build). */
    app: { appUuid: string; name: string; description: string } | null;
    latestReadyVersion: number | null;
    /** The version the provenance line reports; null while history is empty. */
    provenanceVersion: ApiAppVersionSummary | null;
    /** Whether `provenanceVersion` really is the origin (v1 is loaded). */
    hasOrigin: boolean;
    /** False while the visualization has no versions to look back through. */
    hasHistory: boolean;
    isHistoryOpen: boolean;
    onToggleHistory: () => void;
    onPreviewInExplorer: () => void;
};

const ChartTypeBuilderHeader: FC<Props> = ({
    projectUuid,
    app,
    latestReadyVersion,
    provenanceVersion,
    hasOrigin,
    hasHistory,
    isHistoryOpen,
    onToggleHistory,
    onPreviewInExplorer,
}) => {
    const [isEditingDetails, setIsEditingDetails] = useState(false);

    return (
        <Box className={classes.header} component="header">
            <Box className={classes.side}>
                <Button
                    size="xs"
                    component={Link}
                    to={`/projects/${projectUuid}/gallery`}
                    variant="default"
                    leftSection={
                        <MantineIcon icon={IconChevronLeft} size={15} />
                    }
                >
                    Gallery
                </Button>
                <Box className={classes.divider} />
                {app ? (
                    <>
                        <Title
                            className={classes.name}
                            order={6}
                            c="ldDark.9"
                            fw={600}
                            lineClamp={1}
                        >
                            {getAppDisplayName(app.name, app.appUuid)}
                        </Title>
                        {app.description && (
                            <Tooltip
                                withArrow
                                multiline
                                w={280}
                                label={app.description}
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
                        <Tooltip withArrow label="Edit details">
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
                    </>
                ) : (
                    <Text className={classes.name} fz="sm" fw={600} c="dimmed">
                        Untitled chart type
                    </Text>
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
            <Group gap="xs" wrap="nowrap">
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
                {latestReadyVersion !== null && (
                    <Button size="xs" onClick={onPreviewInExplorer}>
                        Preview in explorer
                    </Button>
                )}
            </Group>
            {app && isEditingDetails && (
                <AppUpdateModal
                    opened
                    onClose={() => setIsEditingDetails(false)}
                    onConfirm={() => setIsEditingDetails(false)}
                    projectUuid={projectUuid}
                    uuid={app.appUuid}
                    initialName={getAppDisplayName(app.name, app.appUuid)}
                    initialDescription={app.description}
                    resourceLabel="Chart Type"
                    icon={IconPencil}
                />
            )}
        </Box>
    );
};

export default ChartTypeBuilderHeader;
