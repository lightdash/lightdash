import {
    fieldId as getFieldId,
    getVisibleFields,
    isAdditionalMetric,
    isField,
} from '@lightdash/common';
import { Skeleton, Stack } from '@mantine/core';
import { FC, memo, useMemo } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import PageBreadcrumbs from '../../common/PageBreadcrumbs';
import ExploreTree from '../ExploreTree';
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
    const tableCalculations = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.tableCalculations,
    );
    const activeFields = useExplorerContext(
        (context) => context.state.activeFields,
    );
    const toggleActiveField = useExplorerContext(
        (context) => context.actions.toggleActiveField,
    );
    const { data, status } = useExplore(activeTableName);

    const missingFields = useMemo(() => {
        if (data) {
            const visibleFields = getVisibleFields(data);
            const allFields = [
                ...visibleFields,
                ...tableCalculations,
                ...(customDimensions || []),
                ...(additionalMetrics || []),
            ];

            const fieldIds = allFields.map((item) =>
                isField(item) || isAdditionalMetric(item)
                    ? getFieldId(item)
                    : item.name,
            );
            return [...activeFields].filter((node) => !fieldIds.includes(node));
        }
    }, [
        data,
        activeFields,
        tableCalculations,
        customDimensions,
        additionalMetrics,
    ]);

    if (status === 'loading') {
        return <LoadingSkeleton />;
    }

    if (!data) return null;

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
                                  onClick: onBack,
                              },
                          ]
                        : []),
                    {
                        title: data.label,
                        active: true,
                        tooltipProps: {
                            withinPortal: true,
                            disabled: !data.tables[data.baseTable].description,
                            label: data.tables[data.baseTable].description,
                            position: 'right',
                        },
                    },
                ]}
            />

            <ExploreTree
                explore={data}
                additionalMetrics={additionalMetrics || []}
                selectedNodes={activeFields}
                onSelectedFieldChange={toggleActiveField}
                customDimensions={customDimensions}
                selectedDimensions={dimensions}
                missingFields={missingFields}
            />
        </>
    );
});

export default ExplorePanel;
