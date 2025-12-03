import { subject } from '@casl/ability';
import { FeatureFlags, isTimeZone } from '@lightdash/common';
import { Badge, Box, Button, Group, Tooltip } from '@mantine/core';
import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { memo, useEffect, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import useEmbed from '../../../ee/providers/Embed/useEmbed';
import {
    explorerActions,
    selectIsValidQuery,
    selectQueryLimit,
    selectSavedChart,
    selectTimezone,
    selectUnsavedChartVersion,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useDashboardStorage from '../../../hooks/dashboard/useDashboardStorage';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../hooks/useExplorerRoute';
import useCreateInAnySpaceAccess from '../../../hooks/user/useCreateInAnySpaceAccess';
import { Can } from '../../../providers/Ability';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';
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
    const ability = useAbilityContext();

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

    const dispatch = useExplorerDispatch();

    const savedChart = useExplorerSelector(selectSavedChart);

    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);

    const handleSetTimeZone = (timezone: string | null) => {
        if (timezone && isTimeZone(timezone)) {
            dispatch(explorerActions.setTimeZone(timezone));
        }
    };

    const { getHasDashboardChanges } = useDashboardStorage();

    const userCanCreateChartsInSpace = useCreateInAnySpaceAccess(
        projectUuid,
        'SavedChart',
    );

    const userCanCreateSpace = ability.can(
        'create',
        subject('Space', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
    const embed = useEmbed();
    const isEmbedded = embed.embedToken !== undefined;

    const buttonDisabledMessage = useMemo(() => {
        // There is no concept on abilities about 'create' a SavedChart without space context
        // We need a space to save the chart to whether it is public or user has editor permissions

        // User has permissions to create charts in a public space (eg: interactive viewer with editor space permission)
        if (userCanCreateChartsInSpace) return null;

        // User has permissions to create spaces
        // Therefore, he can create a space for him to save the chart (eg: editor)
        if (userCanCreateSpace) return null;

        // Edge case: there are no public spaces and the user does not have permissions to create spaces
        if (!userCanCreateChartsInSpace && !userCanCreateSpace) {
            return 'There are no public spaces to save this chart to';
        }

        return null;
    }, [userCanCreateChartsInSpace, userCanCreateSpace]);

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

    const userCanManageCompileProject = ability.can('manage', 'CompileProject');

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
                        onChange={handleSetTimeZone}
                        value={selectedTimezone as string}
                    />
                )}

                <RefreshButton size="xs" />

                {!savedChart && !isEmbedded && (
                    <Tooltip
                        disabled={buttonDisabledMessage === null}
                        withinPortal
                        position="bottom"
                        label={buttonDisabledMessage}
                    >
                        <div>
                            <SaveChartButton
                                isExplorer
                                disabled={buttonDisabledMessage !== null}
                            />
                        </div>
                    </Tooltip>
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
