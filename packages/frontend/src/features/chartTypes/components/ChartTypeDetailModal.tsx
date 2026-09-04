import {
    getAppDisplayName,
    isOfficialChartType,
    type DataAppViz,
    type RegistryChartTypeListItem,
} from '@lightdash/common';
import { Box, Button, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconFilePencil, IconGitFork, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link, useNavigate } from 'react-router';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { useAppVersionHistory } from '../../apps/hooks/useAppVersionHistory';
import { useCanCreateDataApp } from '../../apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../../apps/hooks/useCanEditDataApp';
import { useInstallRegistryChartType } from '../hooks/useInstallRegistryChartType';
import { chartTypeBuilderPath } from '../utils/chartTypeBuilderPath';
import classes from './ChartTypeDetailModal.module.css';
import ChartTypeForkModal from './ChartTypeForkModal';
import ChartTypeSamplePreview from './ChartTypeSamplePreview';
import OfficialChartTypeBadge from './OfficialChartTypeBadge';

type Props = {
    projectUuid: string;
    dataAppViz: DataAppViz;
    /** The newer registry version when this official chart type is upgradable */
    registryUpdate: RegistryChartTypeListItem | null;
    onClose: () => void;
    onDelete: () => void;
};

const ChartTypeDetailModal: FC<Props> = ({
    projectUuid,
    dataAppViz,
    registryUpdate,
    onClose,
    onDelete,
}) => {
    const navigate = useNavigate();
    const canEdit = useCanEditDataApp(projectUuid, dataAppViz);
    const canFork = useCanCreateDataApp(projectUuid);
    const isOfficial = isOfficialChartType(dataAppViz);
    const [isForkOpen, setIsForkOpen] = useState(false);
    const upgradeMutation = useInstallRegistryChartType();
    const { latestReadyVersion, oldest, latest, hasOrigin } =
        useAppVersionHistory(projectUuid, dataAppViz.dataAppVizUuid);

    // Only attribute once v1 is loaded — the oldest loaded version is not the
    // origin author while older pages are unfetched.
    const builtBy =
        hasOrigin && oldest?.createdByUser
            ? `${oldest.createdByUser.firstName} ${oldest.createdByUser.lastName}`.trim()
            : null;
    const lastUpdatedAgo = useTimeAgo(
        latest
            ? (latest.statusUpdatedAt ?? latest.createdAt)
            : dataAppViz.createdAt,
    );

    return (
        <>
            <MantineModal
                opened
                onClose={onClose}
                title={
                    <Group gap="xs" wrap="nowrap">
                        <Text fw={700} fz="md" c="ldDark.9">
                            {getAppDisplayName(
                                dataAppViz.name,
                                dataAppViz.dataAppVizUuid,
                            )}
                        </Text>
                        {isOfficial && <OfficialChartTypeBadge />}
                    </Group>
                }
                // The default 80vh cap clips the meta panel.
                bodyScrollAreaMaxHeight="calc(100vh - 200px)"
                cancelLabel={false}
                leftActions={
                    canEdit && (
                        // The theme's subtle variant hardcodes gray text; c overrides it.
                        <Button
                            variant="subtle"
                            size="xs"
                            color="red"
                            c="red.7"
                            leftSection={<MantineIcon icon={IconTrash} />}
                            onClick={onDelete}
                        >
                            {isOfficial ? 'Uninstall' : 'Delete'}
                        </Button>
                    )
                }
                actions={
                    isOfficial ? (
                        canFork && (
                            <Button
                                variant="default"
                                leftSection={<MantineIcon icon={IconGitFork} />}
                                onClick={() => setIsForkOpen(true)}
                            >
                                Fork to customize
                            </Button>
                        )
                    ) : (
                        <Button
                            component={Link}
                            to={chartTypeBuilderPath(
                                projectUuid,
                                dataAppViz.dataAppVizUuid,
                            )}
                            variant="default"
                            leftSection={<MantineIcon icon={IconFilePencil} />}
                        >
                            Edit
                        </Button>
                    )
                }
                onConfirm={() =>
                    navigate(
                        `/projects/${projectUuid}/tables?dataAppVizUuid=${dataAppViz.dataAppVizUuid}`,
                    )
                }
                confirmLabel="Preview in explorer"
            >
                <Stack gap="md">
                    <Box className={classes.preview}>
                        <ChartTypeSamplePreview
                            projectUuid={projectUuid}
                            dataAppVizUuid={dataAppViz.dataAppVizUuid}
                        />
                    </Box>
                    <Text fz="sm" c="ldGray.7" lh={1.55}>
                        {dataAppViz.description || 'No description'}
                    </Text>
                    {registryUpdate && (
                        <Callout
                            variant="info"
                            title={`Update available: v${registryUpdate.version}`}
                        >
                            <Stack gap="sm" align="flex-start">
                                <Text fz="sm">
                                    {registryUpdate.changelog
                                        ? `${registryUpdate.changelog} `
                                        : ''}
                                    Charts pinned to an earlier version keep
                                    rendering it until each chart is upgraded;
                                    charts without a pinned version switch to v
                                    {registryUpdate.version} right away.
                                </Text>
                                {canFork && (
                                    <Button
                                        size="xs"
                                        variant="default"
                                        loading={upgradeMutation.isLoading}
                                        onClick={() =>
                                            upgradeMutation.mutate({
                                                projectUuid,
                                                chartSlug: registryUpdate.slug,
                                            })
                                        }
                                    >
                                        Upgrade to v{registryUpdate.version}
                                    </Button>
                                )}
                            </Stack>
                        </Callout>
                    )}
                    <SimpleGrid cols={2} className={classes.metaPanel}>
                        {builtBy !== null && (
                            <Box>
                                <Text fz="xs" fw={600} c="dimmed">
                                    Built by
                                </Text>
                                <Text fz="sm" fw={500} c="ldGray.8">
                                    {builtBy}
                                </Text>
                            </Box>
                        )}
                        <Box>
                            <Text fz="xs" fw={600} c="dimmed">
                                Last updated
                            </Text>
                            <Text fz="sm" fw={500} c="ldGray.8">
                                {lastUpdatedAgo}
                            </Text>
                        </Box>
                        <Box>
                            <Text fz="xs" fw={600} c="dimmed">
                                Inputs
                            </Text>
                            <Text fz="sm" fw={500} c="ldGray.8">
                                {dataAppViz.schema !== null
                                    ? dataAppViz.schema.fields
                                          .map((field) => field.label)
                                          .join(', ')
                                    : '—'}
                            </Text>
                        </Box>
                        <Box>
                            <Text fz="xs" fw={600} c="dimmed">
                                Version
                            </Text>
                            <Text fz="sm" fw={500} c="ldGray.8">
                                {latestReadyVersion !== null
                                    ? `v${latestReadyVersion}`
                                    : '—'}
                            </Text>
                        </Box>
                    </SimpleGrid>
                    {dataAppViz.schema === null && (
                        <Text fz="sm" c="dimmed">
                            No finished version yet. Open the builder to
                            generate one.
                        </Text>
                    )}
                </Stack>
            </MantineModal>
            {isForkOpen && (
                <ChartTypeForkModal
                    opened
                    onClose={() => setIsForkOpen(false)}
                    projectUuid={projectUuid}
                    appUuid={dataAppViz.dataAppVizUuid}
                    defaultName={`${dataAppViz.name} (custom)`}
                />
            )}
        </>
    );
};

export default ChartTypeDetailModal;
