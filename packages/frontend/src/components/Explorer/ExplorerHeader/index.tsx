import { FeatureFlags } from '@lightdash/common';
import { Badge, Box, Group, Tooltip } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { memo, useEffect, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import useDashboardStorage from '../../../hooks/dashboard/useDashboardStorage';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../hooks/useExplorerRoute';
import useCreateInAnySpaceAccess from '../../../hooks/user/useCreateInAnySpaceAccess';
import useApp from '../../../providers/App/useApp';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import { RefreshButton } from '../../RefreshButton';
import RefreshDbtButton from '../../RefreshDbtButton';
import MantineIcon from '../../common/MantineIcon';
import ShareShortLinkButton from '../../common/ShareShortLinkButton';
import TimeZonePicker from '../../common/TimeZonePicker';
import SaveChartButton from '../SaveChartButton';
import QueryWarnings from './QueryWarnings';

const ExplorerHeader: FC = memo(() => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user } = useApp();

    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );
    const unsavedChartVersion = useExplorerContext(
        (context) => context.state.unsavedChartVersion,
    );
    const isValidQuery = useExplorerContext(
        (context) => context.state.isValidQuery,
    );
    const showLimitWarning = useExplorerContext(
        (context) =>
            context.queryResults.totalResults &&
            context.queryResults.totalResults >=
                context.state.unsavedChartVersion.metricQuery.limit,
    );
    const queryWarnings = useExplorerContext(
        (context) => context.query.data?.warnings,
    );
    const limit = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.limit,
    );

    const selectedTimezone = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.timezone,
    );
    const setTimeZone = useExplorerContext(
        (context) => context.actions.setTimeZone,
    );

    const { getHasDashboardChanges } = useDashboardStorage();

    const userCanCreateCharts = useCreateInAnySpaceAccess(
        projectUuid,
        'SavedChart',
    );

    const urlToShare = useMemo(() => {
        if (unsavedChartVersion) {
            const urlArgs = getExplorerUrlFromCreateSavedChartVersion(
                projectUuid,
                unsavedChartVersion,
                true,
            );
            return {
                pathname: urlArgs.pathname,
                search: `?${urlArgs.search}`,
            };
        }
    }, [unsavedChartVersion, projectUuid]);

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

    // FEATURE FLAG: this component doesn't appear when the feature flag is disabled
    const userTimeZonesEnabled = useFeatureFlagEnabled(
        FeatureFlags.EnableUserTimezones,
    );

    const userCanManageCompileProject = user?.data?.ability?.can(
        'manage',
        'CompileProject',
    );
    const showQueryWarningsEnabled = useFeatureFlagEnabled(
        FeatureFlags.ShowQueryWarnings,
    );

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

                {userCanManageCompileProject &&
                    showQueryWarningsEnabled &&
                    queryWarnings &&
                    queryWarnings.length > 0 && (
                        <QueryWarnings queryWarnings={queryWarnings} />
                    )}

                {userTimeZonesEnabled && (
                    <TimeZonePicker
                        onChange={setTimeZone}
                        value={selectedTimezone}
                    />
                )}

                <RefreshButton size="xs" />

                {!savedChart && userCanCreateCharts && (
                    <SaveChartButton isExplorer />
                )}
                <ShareShortLinkButton
                    disabled={!isValidQuery}
                    url={urlToShare}
                />
            </Group>
        </Group>
    );
});

export default ExplorerHeader;
