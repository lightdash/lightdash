import { subject } from '@casl/ability';
import { Badge, Box, Button, Group, Tooltip } from '@mantine-8/core';
import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import { memo, useEffect, useMemo, type FC } from 'react';
import useEmbed from '../../../ee/providers/Embed/useEmbed';
import {
    selectIsValidQuery,
    selectQueryLimit,
    selectSavedChart,
    selectUnsavedChartVersion,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useDashboardStorage from '../../../hooks/dashboard/useDashboardStorage';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../hooks/useExplorerRoute';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import useCreateInAnySpaceAccess from '../../../hooks/user/useCreateInAnySpaceAccess';
import { Can } from '../../../providers/Ability';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import ShareShortLinkButton from '../../common/ShareShortLinkButton';
import { RefreshButton } from '../../RefreshButton';
import RefreshDbtButton from '../../RefreshDbtButton';
import SaveChartButton from '../SaveChartButton';
import QueryWarnings from './QueryWarnings';

const ExplorerHeader: FC = memo(() => {
    const projectUuid = useProjectUuid();
    const { user } = useApp();
    const { exploreBackLabel, onBackToDashboard } = useEmbed();
    const ability = useAbilityContext();

    // Get state from Redux and new hook
    const limit = useExplorerSelector(selectQueryLimit);
    const isValidQuery = useExplorerSelector(selectIsValidQuery);
    const { query, queryResults } = useExplorerQuery();

    // Compute values from new hook data
    const showLimitWarning = useMemo(
        () => queryResults.totalResults && queryResults.totalResults >= limit,
        [queryResults.totalResults, limit],
    );
    const queryWarnings = query.data?.warnings;

    const savedChart = useExplorerSelector(selectSavedChart);

    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);

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
    const hasEmbedWriteActions =
        !!embed.writeActions?.spaceUuid &&
        (!!embed.writeActions.userUuid ||
            !!embed.writeActions.serviceAccountUserUuid);
    const canCreateEmbedSavedChart =
        hasEmbedWriteActions &&
        embed.embedWriteContext?.canCreateSavedChart === true;

    const buttonDisabledMessage = useMemo(() => {
        if (isEmbedded) {
            return canCreateEmbedSavedChart
                ? null
                : 'This embed token does not allow saving charts';
        }

        // A chart always needs a space to be saved to (a public space or one the user can create)
        if (userCanCreateChartsInSpace) return null;
        if (userCanCreateSpace) return null;

        // The user lacks permission to save a chart in any space
        return "You don't have permission to save charts in this project";
    }, [
        canCreateEmbedSavedChart,
        isEmbedded,
        userCanCreateChartsInSpace,
        userCanCreateSpace,
    ]);

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

    const userCanManageCompileProject = ability.can('manage', 'CompileProject');

    return (
        <Group justify="space-between">
            {typeof onBackToDashboard === 'function' && (
                <Button
                    variant="light"
                    leftSection={<MantineIcon icon={IconArrowLeft} />}
                    onClick={onBackToDashboard}
                >
                    {exploreBackLabel ?? 'Back to Dashboard'}
                </Button>
            )}

            <Box>
                <RefreshDbtButton />
            </Box>

            <Group gap="xs">
                {showLimitWarning && (
                    <Tooltip
                        w={400}
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
                            style={{ cursor: 'help' }}
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

                <RefreshButton size="xs" />

                {!savedChart && (!isEmbedded || canCreateEmbedSavedChart) && (
                    <Tooltip
                        disabled={buttonDisabledMessage === null}
                        withinPortal
                        position="bottom"
                        label={buttonDisabledMessage}
                    >
                        <div>
                            <SaveChartButton
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
