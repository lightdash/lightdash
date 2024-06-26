import {
    convertFieldRefToFieldId,
    getAllReferences,
    getItemId,
    getVisibleFields,
    isCustomBinDimension,
    isCustomSqlDimension,
} from '@lightdash/common';
import { Skeleton, Stack } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
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
    const { activeProjectUuid: projectUuid } = useActiveProjectUuid();
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
            <PageBreadcrumbs
                size="md"
                items={[
                    ...(onBack
                        ? [
                              {
                                  title: 'Tables',
                                  to: `/projects/${projectUuid}/catalog`,
                                  state: {
                                      activeTableName,
                                  },
                              },
                          ]
                        : []),
                    {
                        title: explore.label,
                        active: true,
                    },
                ]}
            />

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
        </>
    );
});

export default ExplorePanel;
