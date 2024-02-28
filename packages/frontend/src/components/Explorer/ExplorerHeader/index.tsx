import { Badge, Box, Group, Tooltip } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { FC, memo, useEffect } from 'react';
import useDashboardStorage from '../../../hooks/dashboard/useDashboardStorage';
import {
    ExploreMode,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import { Can } from '../../common/Authorization';
import MantineIcon from '../../common/MantineIcon';
import ShareShortLinkButton from '../../common/ShareShortLinkButton';
import ExploreFromHereButton from '../../ExploreFromHereButton';
import { RefreshButton } from '../../RefreshButton';
import RefreshDbtButton from '../../RefreshDbtButton';
import SaveChartButton from '../SaveChartButton';

const ExplorerHeader: FC = memo(() => {
    const isEditMode = useExplorerContext(
        (context) => context.state.mode === ExploreMode.EDIT,
    );
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

    if (isEditMode) {
        return (
            <Group position="apart">
                <Box>
                    <RefreshDbtButton />
                </Box>

                <Group spacing="xs">
                    {showLimitWarning && (
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

                    <RefreshButton size="xs" />

                    {!savedChart && (
                        <Can I="manage" a="SavedChart">
                            <SaveChartButton isExplorer />
                        </Can>
                    )}
                    <ShareShortLinkButton disabled={!isValidQuery} />
                </Group>
            </Group>
        );
    }

    return (
        <Group position="right" spacing="xs">
            <ExploreFromHereButton />
            <ShareShortLinkButton disabled={!isValidQuery} />
        </Group>
    );
});

export default ExplorerHeader;
