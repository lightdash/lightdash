import {
    Explore,
    fieldId as getFieldId,
    getVisibleFields,
    SupportedDbtAdapter,
} from '@lightdash/common';
import { Skeleton, Stack } from '@mantine/core';
import { FC, memo, useEffect, useMemo } from 'react';
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
    const activeTableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const customSqlResults = useExplorerContext(
        (context) => context.state.customSql?.results,
    );
    const customMetricQuery = customSqlResults?.metricQuery;
    const metricQuery = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery,
    );

    const additionalMetrics = useMemo(() => {
        return (
            customMetricQuery?.additionalMetrics ??
            metricQuery?.additionalMetrics
        );
    }, [customMetricQuery, metricQuery]);

    const dimensions = useMemo(() => {
        return customMetricQuery?.dimensions ?? metricQuery?.dimensions;
    }, [customMetricQuery, metricQuery]);

    const metrics = useMemo(() => {
        return customMetricQuery?.metrics ?? metricQuery?.metrics;
    }, [customMetricQuery, metricQuery]);

    const customDimensions = useMemo(() => {
        return (
            customMetricQuery?.customDimensions ?? metricQuery?.customDimensions
        );
    }, [customMetricQuery, metricQuery]);

    const activeFields = useExplorerContext(
        (context) => context.state.activeFields,
    );
    const toggleActiveField = useExplorerContext(
        (context) => context.actions.toggleActiveField,
    );
    const {
        data: savedExplore,
        isInitialLoading,
        isError,
    } = useExplore(activeTableName);

    const missingFields = useMemo(() => {
        if (savedExplore) {
            const visibleFields = getVisibleFields(savedExplore);
            const allFields = [...visibleFields, ...(additionalMetrics || [])];

            const selectedFields = [...metrics, ...dimensions];

            const fieldIds = allFields.map(getFieldId);
            return selectedFields.filter((node) => !fieldIds.includes(node));
        }
    }, [savedExplore, additionalMetrics, metrics, dimensions]);

    useEffect(() => {
        if (isError) onBack?.();
    }, [isError, onBack]);

    const customExplore: Explore | undefined = useMemo(() => {
        if (!customSqlResults) return undefined;

        return {
            name: 'custom',
            label: 'Custom explore',
            tags: [],
            baseTable: 'custom',
            joinedTables: [],
            tables: {},
            targetDatabase: SupportedDbtAdapter.POSTGRES,
        };
    }, [customSqlResults]);

    if (isError) return null;

    if (isInitialLoading) return <LoadingSkeleton />;

    const explore = customExplore ? customExplore : savedExplore;

    if (!explore) return null;

    console.log(explore);

    return (
        <>
            <PageBreadcrumbs
                size="md"
                items={[
                    ...(onBack && !customMetricQuery
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
