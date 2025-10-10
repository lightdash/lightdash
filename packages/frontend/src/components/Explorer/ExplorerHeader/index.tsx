import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import { Badge, Box, Button, Group, Tooltip } from '@mantine/core';
import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { memo, useEffect, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import useEmbed from '../../../ee/providers/Embed/useEmbed';
import {
    selectIsValidQuery,
    selectQueryLimit,
    selectTimezone,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useDashboardStorage from '../../../hooks/dashboard/useDashboardStorage';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../hooks/useExplorerRoute';
import useCreateInAnySpaceAccess from '../../../hooks/user/useCreateInAnySpaceAccess';
import { Can } from '../../../providers/Ability';
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
    const { onBackToDashboard } = useEmbed();

    // Get state from Redux and new hook
    const limit = useExplorerSelector(selectQueryLimit);
    const selectedTimezone = useExplorerSelector(selectTimezone);
    const isValidQuery = useExplorerSelector(selectIsValidQuery);
    const { query, queryResults } = useExplorerQuery();

    // Compute values from new hook data
    const showLimitWarning = useMemo(
        () => queryResults.totalResults && queryResults.totalResults >= limit,
        [queryResults.totalResults, limit],
    );
    const queryWarnings = query.data?.warnings;

    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );
    const mergedUnsavedChartVersion = useExplorerContext(
        (context) => context.state.mergedUnsavedChartVersion,
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
        if (mergedUnsavedChartVersion) {
            const urlArgs = getExplorerUrlFromCreateSavedChartVersion(
                projectUuid,
                mergedUnsavedChartVersion,
                true,
            );
            return {
                pathname: urlArgs.pathname,
                search: `?${urlArgs.search}`,
            };
        }
    }, [mergedUnsavedChartVersion, projectUuid]);

    console.log(unsavedChartVersion.chartConfig);

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

    return (
        <Group position="apart">
            {typeof onBackToDashboard === 'function' && (
                <Button
                    variant="light"
                    leftIcon={<MantineIcon icon={IconArrowLeft} />}
                    onClick={onBackToDashboard}
                >
                    Back to Dashboard
                </Button>
            )}

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
                    queryWarnings &&
                    queryWarnings.length > 0 && (
                        <QueryWarnings queryWarnings={queryWarnings} />
                    )}

                {userTimeZonesEnabled && (
                    <TimeZonePicker
                        onChange={setTimeZone}
                        value={selectedTimezone as string}
                    />
                )}

                <RefreshButton size="xs" />

                {!savedChart && userCanCreateCharts && (
                    <SaveChartButton isExplorer />
                )}
                <Can
                    I="update"
                    this={subject('Explore', {
                        organizationUuid: user.data?.organizationUuid,
                        projectUuid,
                    })}
                >
                    <ShareShortLinkButton
                        disabled={!isValidQuery}
                        url={urlToShare}
                    />
                </Can>
            </Group>
        </Group>
    );
});

export default ExplorerHeader;
