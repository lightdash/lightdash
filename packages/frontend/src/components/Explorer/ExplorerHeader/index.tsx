import { Badge, Box, Group, Tooltip } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { memo, useEffect, type FC } from 'react';
import { useParams } from 'react-router-dom';
import useDashboardStorage from '../../../hooks/dashboard/useDashboardStorage';
import useCreateInAnySpaceAccess from '../../../hooks/user/useCreateInAnySpaceAccess';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import MantineIcon from '../../common/MantineIcon';
import ShareShortLinkButton from '../../common/ShareShortLinkButton';
import TimeZonePicker from '../../common/TimeZonePicker';
import { RefreshButton } from '../../RefreshButton';
import RefreshDbtButton from '../../RefreshDbtButton';
import SaveChartButton from '../SaveChartButton';

const ExplorerHeader: FC = memo(() => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );
    const isValidQuery = useExplorerContext(
        (context) => context.state.isValidQuery,
    );
    const showLimitWarning = useExplorerContext(
        (context) =>
            context.queryResults.data &&
            context.queryResults.data.rows.length >=
                context.state.unsavedChartVersion.metricQuery.limit,
    );
    const limit = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.limit,
    );

    const { getHasDashboardChanges } = useDashboardStorage();

    const userCanCreateCharts = useCreateInAnySpaceAccess(
        projectUuid,
        'SavedChart',
    );

    useEffect(() => {
        const checkReload = (event: BeforeUnloadEvent) => {
            if (getHasDashboardChanges()) {
                const message =
                    'You have unsaved changes to your dashboard! Are you sure you want to leave without saving?';
                event.returnValue = message;
                return message;
            }
        };
        window.addEventListener('beforeunload', checkReload);
        return () => {
            window.removeEventListener('beforeunload', checkReload);
        };
    }, [getHasDashboardChanges]);

    return (
        <Group position="apart">
            <Box>
                <RefreshDbtButton />
            </Box>

            <Group spacing="xs">
                {!showLimitWarning && (
                    <Tooltip
                        width={400}
                        label={`Query limit of ${limit} reached. There may be additional results that have not been displayed. To see more, increase the query limit or try narrowing filters.`}
                        multiline
                        position={'bottom'}
                    >
                        <Badge
                            leftSection={
                                <MantineIcon
                                    icon={IconAlertCircle}
                                    size={'sm'}
                                />
                            }
                            color="yellow"
                            variant="outline"
                            tt="none"
                            sx={{ cursor: 'help' }}
                        >
                            Results may be incomplete
                        </Badge>
                    </Tooltip>
                )}

                <TimeZonePicker />

                <RefreshButton size="xs" />

                {!savedChart && userCanCreateCharts && (
                    <SaveChartButton isExplorer />
                )}
                <ShareShortLinkButton disabled={!isValidQuery} />
            </Group>
        </Group>
    );
});

export default ExplorerHeader;
