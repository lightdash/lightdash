import { getAppDisplayName, type DataAppViz } from '@lightdash/common';
import { Box, Button, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconFilePencil, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link, useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { useAppVersionHistory } from '../../apps/hooks/useAppVersionHistory';
import { useCanEditDataApp } from '../../apps/hooks/useCanEditDataApp';
import classes from './ChartTypeDetailModal.module.css';
import ChartTypeSamplePreview from './ChartTypeSamplePreview';

type Props = {
    projectUuid: string;
    dataAppViz: DataAppViz;
    onClose: () => void;
    onDelete: () => void;
};

const ChartTypeDetailModal: FC<Props> = ({
    projectUuid,
    dataAppViz,
    onClose,
    onDelete,
}) => {
    const navigate = useNavigate();
    const canEdit = useCanEditDataApp(projectUuid, dataAppViz);
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
        <MantineModal
            opened
            onClose={onClose}
            title={getAppDisplayName(
                dataAppViz.name,
                dataAppViz.dataAppVizUuid,
            )}
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
                        Delete
                    </Button>
                )
            }
            actions={
                <Button
                    component={Link}
                    to={`/projects/${projectUuid}/chart-types/${dataAppViz.dataAppVizUuid}`}
                    variant="default"
                    leftSection={<MantineIcon icon={IconFilePencil} />}
                >
                    Edit
                </Button>
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
                <SimpleGrid cols={2} className={classes.metaPanel}>
                    {builtBy !== null && (
                        <Box>
                            <Text fz={12} fw={600} c="ldGray.6">
                                Built by
                            </Text>
                            <Text fz="sm" fw={500} c="ldGray.8">
                                {builtBy}
                            </Text>
                        </Box>
                    )}
                    <Box>
                        <Text fz={12} fw={600} c="ldGray.6">
                            Last updated
                        </Text>
                        <Text fz="sm" fw={500} c="ldGray.8">
                            {lastUpdatedAgo}
                        </Text>
                    </Box>
                    <Box>
                        <Text fz={12} fw={600} c="ldGray.6">
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
                        <Text fz={12} fw={600} c="ldGray.6">
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
                        No finished version yet. Open the builder to generate
                        one.
                    </Text>
                )}
            </Stack>
        </MantineModal>
    );
};

export default ChartTypeDetailModal;
