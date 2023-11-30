import { Alert, Box, Skeleton, Stack } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { FC, memo } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import MantineIcon from '../../common/MantineIcon';
import PageBreadcrumbs from '../../common/PageBreadcrumbs';
import { RefreshButton } from '../../RefreshButton';
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
    const customDimensions = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.customDimensions,
    );
    const activeFields = useExplorerContext(
        (context) => context.state.activeFields,
    );
    const toggleActiveField = useExplorerContext(
        (context) => context.actions.toggleActiveField,
    );
    const showLimitWarning = useExplorerContext(
        (context) =>
            context.queryResults.data &&
            context.queryResults.data.rows.length >=
                context.state.unsavedChartVersion.metricQuery.limit,
    );
    const { data, status } = useExplore(activeTableName);

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
            />
            <Box py="md">
                {showLimitWarning && (
                    <Alert
                        icon={<MantineIcon icon={IconAlertCircle} />}
                        color="orange"
                        title="Results may be incomplete"
                        mb="md"
                    >
                        The number of results returned is the same or more than
                        the limit you've set
                    </Alert>
                )}
                <RefreshButton />
            </Box>
        </>
    );
});

export default ExplorePanel;
