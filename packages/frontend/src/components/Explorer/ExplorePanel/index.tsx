import { subject } from '@casl/ability';
import {
    convertFieldRefToFieldId,
    ExploreType,
    getAllReferences,
    getItemId,
    getVisibleFields,
    isCustomBinDimension,
    isCustomSqlDimension,
} from '@lightdash/common';
import { ActionIcon, Group, Menu, Skeleton, Stack, Text } from '@mantine/core';
import { IconDots, IconPencil, IconTrash } from '@tabler/icons-react';
import { memo, useMemo, useState, useTransition, type FC } from 'react';
import { useParams } from 'react-router-dom';
import {
    DeleteVirtualViewModal,
    EditVirtualViewModal,
} from '../../../features/virtualView';
import { useExplore } from '../../../hooks/useExplore';
import { useApp } from '../../../providers/AppProvider';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import MantineIcon from '../../common/MantineIcon';
import PageBreadcrumbs from '../../common/PageBreadcrumbs';
import ExploreTree from '../ExploreTree';
import { ItemDetailProvider } from '../ExploreTree/TableTree/ItemDetailContext';

const LoadingSkeleton = () => (
    <Stack>
        <Skeleton h="md" />

        <Skeleton h="xxl" />

        <Stack spacing="xxs">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => (
                <Skeleton key={index} h="xxl" />
            ))}
        </Stack>
    </Stack>
);

interface ExplorePanelProps {
    onBack?: () => void;
}

const ExplorePanel: FC<ExplorePanelProps> = memo(({ onBack }) => {
    const [isEditVirtualViewOpen, setIsEditVirtualViewOpen] = useState(false);
    const [isDeleteVirtualViewOpen, setIsDeleteVirtualViewOpen] =
        useState(false);
    const [, startTransition] = useTransition();

    const { projectUuid } = useParams<{ projectUuid: string }>();
    const activeTableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const additionalMetrics = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.additionalMetrics,
    );
    const dimensions = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.dimensions,
    );
    const customDimensions = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.customDimensions,
    );
    const metrics = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.metrics,
    );
    const activeFields = useExplorerContext(
        (context) => context.state.activeFields,
    );
    const toggleActiveField = useExplorerContext(
        (context) => context.actions.toggleActiveField,
    );
    const { data: explore, status } = useExplore(activeTableName);

    const { user } = useApp();
    const canManageVirtualViews = user.data?.ability?.can(
        'manage',
        subject('VirtualView', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const missingFields = useMemo(() => {
        if (explore) {
            const visibleFields = getVisibleFields(explore);

            const allFields = [
                ...visibleFields,
                ...(additionalMetrics || []),
                ...(customDimensions || []),
            ];
            const selectedFields = [...metrics, ...dimensions];
            const fieldIds = allFields.map((field) => getItemId(field));

            const missingCustomMetrics = additionalMetrics?.filter((metric) => {
                const table = explore.tables[metric.table];
                return (
                    !table ||
                    (metric.baseDimensionName &&
                        !table.dimensions[metric.baseDimensionName])
                );
            });

            const missingCustomDimensions = customDimensions?.filter(
                (customDimension) => {
                    const isCustomBinDimensionMissing =
                        isCustomBinDimension(customDimension) &&
                        !fieldIds.includes(customDimension.dimensionId);

                    const isCustomSqlDimensionMissing =
                        isCustomSqlDimension(customDimension) &&
                        getAllReferences(customDimension.sql)
                            .map((ref) => convertFieldRefToFieldId(ref))
                            .some(
                                (refFieldId) => !fieldIds.includes(refFieldId),
                            );

                    return (
                        isCustomBinDimensionMissing ||
                        isCustomSqlDimensionMissing
                    );
                },
            );

            return {
                all: selectedFields.filter((node) => !fieldIds.includes(node)),
                customMetrics: missingCustomMetrics,
                customDimensions: missingCustomDimensions,
            };
        }
    }, [explore, additionalMetrics, metrics, dimensions, customDimensions]);

    if (status === 'loading') {
        return <LoadingSkeleton />;
    }

    if (!explore) return null;

    if (status === 'error') {
        if (onBack) onBack();
        return null;
    }

    return (
        <>
            <Group position="apart">
                <PageBreadcrumbs
                    size="md"
                    items={[
                        ...(onBack
                            ? [
                                  {
                                      title: 'Tables',
                                      onClick: onBack,
                                  },
                              ]
                            : []),
                        {
                            title: explore.label,
                            active: true,
                        },
                    ]}
                />
                {canManageVirtualViews && explore.type === ExploreType.VIRTUAL && (
                    <Menu withArrow offset={-2}>
                        <Menu.Target>
                            <ActionIcon variant="transparent">
                                <MantineIcon icon={IconDots} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                icon={<MantineIcon icon={IconPencil} />}
                                onClick={() => {
                                    startTransition(() => {
                                        setIsEditVirtualViewOpen(true);
                                    });
                                }}
                            >
                                <Text fz="xs" fw={500}>
                                    Edit virtual view
                                </Text>
                            </Menu.Item>
                            <Menu.Item
                                icon={<MantineIcon icon={IconTrash} />}
                                color="red"
                                onClick={() => {
                                    setIsDeleteVirtualViewOpen(true);
                                }}
                            >
                                <Text fz="xs" fw={500}>
                                    Delete
                                </Text>
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                )}
            </Group>

            <ItemDetailProvider>
                <ExploreTree
                    explore={explore}
                    additionalMetrics={additionalMetrics || []}
                    selectedNodes={activeFields}
                    onSelectedFieldChange={toggleActiveField}
                    customDimensions={customDimensions}
                    selectedDimensions={dimensions}
                    missingFields={missingFields}
                />
            </ItemDetailProvider>

            {isEditVirtualViewOpen && (
                <EditVirtualViewModal
                    opened={isEditVirtualViewOpen}
                    onClose={() => setIsEditVirtualViewOpen(false)}
                    activeTableName={activeTableName}
                    setIsEditVirtualViewOpen={setIsEditVirtualViewOpen}
                    explore={explore}
                />
            )}
            {isDeleteVirtualViewOpen && (
                <DeleteVirtualViewModal
                    opened={isDeleteVirtualViewOpen}
                    onClose={() => setIsDeleteVirtualViewOpen(false)}
                    virtualViewName={activeTableName}
                    projectUuid={projectUuid}
                />
            )}
        </>
    );
});

export default ExplorePanel;
