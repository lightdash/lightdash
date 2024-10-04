import {
    convertFieldRefToFieldId,
    ExploreType,
    getAllReferences,
    getItemId,
    getVisibleFields,
    isCustomBinDimension,
    isCustomSqlDimension,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    Loader,
    Menu,
    Modal,
    Skeleton,
    Stack,
    Text,
} from '@mantine/core';
import { IconDots, IconPencil } from '@tabler/icons-react';
import {
    lazy,
    memo,
    Suspense,
    useMemo,
    useState,
    useTransition,
    type FC,
} from 'react';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import MantineIcon from '../../common/MantineIcon';
import PageBreadcrumbs from '../../common/PageBreadcrumbs';
import ExploreTree from '../ExploreTree';
import { ItemDetailProvider } from '../ExploreTree/TableTree/ItemDetailContext';

const SqlRunnerNewPage = lazy(() => import('../../../pages/SqlRunnerNew'));

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
    const [, startTransition] = useTransition();

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
            <Box pos="relative">
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
                {explore.type === ExploreType.VIRTUAL && (
                    <Menu>
                        <Menu.Target>
                            <ActionIcon
                                variant="transparent"
                                pos="absolute"
                                top="0"
                                right="0"
                            >
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
                        </Menu.Dropdown>
                    </Menu>
                )}
            </Box>

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
                <Modal
                    opened={isEditVirtualViewOpen}
                    onClose={() => setIsEditVirtualViewOpen(false)}
                    title={null}
                    size="95vw"
                    yOffset="3vh"
                    xOffset="2vw"
                    styles={(theme) => ({
                        header: {
                            padding: `${theme.spacing.xs} ${theme.spacing.lg}`,
                        },
                        body: {
                            padding: 0,
                        },
                    })}
                    withCloseButton={false}
                >
                    <Suspense
                        fallback={
                            <Center h="95vh" w="95vw">
                                <Stack align="center" justify="center">
                                    <Loader variant="bars" />
                                    <Text fw={500}>Loading SQL Runner...</Text>
                                </Stack>
                            </Center>
                        }
                    >
                        <SqlRunnerNewPage
                            isEditMode
                            virtualViewState={{
                                name: explore.name,
                                sql: explore.tables[activeTableName].sqlTable,
                            }}
                        />
                    </Suspense>
                </Modal>
            )}
        </>
    );
});

export default ExplorePanel;
