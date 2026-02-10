import {
    ActionIcon,
    Box,
    Group,
    Paper,
    Stack,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconBinaryTree, IconEdit, IconEye } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { Panel, PanelGroup } from 'react-resizable-panels';
import { EmptyState } from '../../../components/common/EmptyState';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useMetricsTrees } from '../hooks/useMetricsTrees';
import TreeCanvas from './Canvas/TreeCanvas';
import TreesSidebar from './Canvas/TreesSidebar';

export const MetricsTreeView: FC = () => {
    const {
        projectUuid,
        abilities: { canManageMetricsTree },
    } = useAppSelector((state) => ({
        projectUuid: state.metricsCatalog.projectUuid,
        abilities: state.metricsCatalog.abilities,
    }));

    const { data: treesData, isLoading: isLoadingTrees } =
        useMetricsTrees(projectUuid);
    const [selectedTreeUuid, setSelectedTreeUuid] = useState<string | null>(
        null,
    );
    const [isEditing, setIsEditing] = useState(false);

    const selectedTree = useMemo(
        () =>
            treesData?.data.find(
                (t) => t.metricsTreeUuid === selectedTreeUuid,
            ) ?? null,
        [treesData?.data, selectedTreeUuid],
    );

    return (
        <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
            <PanelGroup direction="horizontal" style={{ minHeight: 600 }}>
                <TreesSidebar
                    trees={treesData?.data || []}
                    selectedTreeUuid={selectedTreeUuid}
                    onSelectTree={setSelectedTreeUuid}
                    isLoading={isLoadingTrees}
                />
                <Panel id="tree-main-content" order={2}>
                    {selectedTree && (
                        <Box w="100%" p="md">
                            <Group justify="space-between" wrap="nowrap">
                                <Stack gap="xxs">
                                    <Title order={6}>{selectedTree.name}</Title>
                                </Stack>
                                {canManageMetricsTree && (
                                    <Tooltip
                                        label={
                                            isEditing
                                                ? 'Switch to view mode'
                                                : 'Edit tree'
                                        }
                                    >
                                        <ActionIcon
                                            variant={
                                                isEditing ? 'filled' : 'subtle'
                                            }
                                            color={isEditing ? 'blue' : 'gray'}
                                            onClick={() =>
                                                setIsEditing((prev) => !prev)
                                            }
                                        >
                                            <MantineIcon
                                                icon={
                                                    isEditing
                                                        ? IconEye
                                                        : IconEdit
                                                }
                                                size={16}
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                )}
                            </Group>
                        </Box>
                    )}
                    {selectedTreeUuid ? (
                        <TreeCanvas
                            metricsTreeUuid={selectedTreeUuid}
                            viewOnly={!isEditing}
                        />
                    ) : (
                        <EmptyState
                            title="Select a tree to view metrics"
                            icon={<IconBinaryTree />}
                        />
                    )}
                </Panel>
            </PanelGroup>
        </Paper>
    );
};
