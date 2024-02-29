import { fieldId as getFieldId, getVisibleFields } from '@lightdash/common';
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

    const customExplore = useExplorerContext(
        (context) => context.state.customExplore,
    );

    const metricQuery = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery,
    );

    const additionalMetrics = useMemo(() => {
        return metricQuery?.additionalMetrics;
    }, [metricQuery]);

    const dimensions = useMemo(() => {
        return metricQuery?.dimensions;
    }, [metricQuery]);

    const metrics = useMemo(() => {
        return metricQuery?.metrics;
    }, [metricQuery]);

    const customDimensions = useMemo(() => {
        return metricQuery?.customDimensions;
    }, [metricQuery]);

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

    if (isError) return null;

    if (isInitialLoading) return <LoadingSkeleton />;

    const explore = customExplore ? customExplore.explore : savedExplore;

    if (!explore) return null;

    return (
        <>
            <PageBreadcrumbs
                size="md"
                items={[
                    ...(onBack && !customExplore
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
