import { subject } from '@casl/ability';
import { assertUnreachable, type UiStringKey } from '@lightdash/common';
import { Badge, Box, Button, Group, Tooltip } from '@mantine/core';
import {
    IconAlertCircle,
    IconArrowLeft,
    IconRefreshAlert,
} from '@tabler/icons-react';
import { memo, useEffect, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { type EmbedBackDestination } from '../../../ee/providers/Embed/types';
import useEmbed from '../../../ee/providers/Embed/useEmbed';
import { useUiString } from '../../../ee/providers/Embed/useUiStrings';
import {
    selectIsChartTypeAuthoring,
    selectIsValidQuery,
    selectQueryLimit,
    selectSavedChart,
    selectUnsavedChartVersion,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useMergeChangeSinceRun } from '../../../features/mergeQuery/hooks/useMergeChangeSinceRun';
import useDashboardStorage from '../../../hooks/dashboard/useDashboardStorage';
import { useExploreConnectionName } from '../../../hooks/useConnectionBadges';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../hooks/useExplorerRoute';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import useCreateInAnySpaceAccess from '../../../hooks/user/useCreateInAnySpaceAccess';
import { useVerificationSavePrompt } from '../../../hooks/useVerificationSavePrompt';
import { Can } from '../../../providers/Ability';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';
import { useIsModalHosted } from '../../../providers/Explorer/useIsModalHosted';
import ConnectionBadge from '../../common/ConnectionBadge';
import MantineIcon from '../../common/MantineIcon';
import ShareShortLinkButton from '../../common/ShareShortLinkButton';
import { RefreshButton } from '../../RefreshButton';
import RefreshDbtButton from '../../RefreshDbtButton';
import SaveChartButton from '../SaveChartButton';
import { useExplorerResultsData } from '../VisualizationCard/useExplorerResultsData';
import QueryWarnings from './QueryWarnings';

const getBackButtonLabelKey = (
    destination: EmbedBackDestination,
): UiStringKey => {
    switch (destination) {
        case 'dashboard':
            return 'explorer.backToDashboard';
        case 'chart':
            return 'explorer.backToChart';
        case 'aiAgent':
            return 'explorer.backToAi';
        case 'metricsCatalog':
            return 'explorer.backToMetricsCatalog';
        case 'explore':
            return 'explorer.back';
        default:
            return assertUnreachable(destination, 'Unknown back destination');
    }
};

const ExplorerHeader: FC = memo(() => {
    const { t } = useTranslation('explorer');
    const projectUuid = useProjectUuid();
    const { user } = useApp();
    const { backDestination, onBackToDashboard } = useEmbed();
    const backButtonLabel = useUiString(getBackButtonLabelKey(backDestination));
    const ability = useAbilityContext();

    // Get state from Redux and new hook
    const limit = useExplorerSelector(selectQueryLimit);
    const isValidQuery = useExplorerSelector(selectIsValidQuery);
    const { query, mergeResults, resultsData } = useExplorerResultsData();

    // For a merge the effective limit is the merged result's, not a leg's.
    const reachedLimit = mergeResults ? mergeResults.mergeQuery.limit : limit;
    const showLimitWarning = useMemo(
        () =>
            !!resultsData.totalResults &&
            resultsData.totalResults >= reachedLimit,
        [resultsData.totalResults, reachedLimit],
    );
    const limitWarning = mergeResults
        ? t('explorerHeader.mergeLimitWarning', { limit: reachedLimit })
        : t('explorerHeader.limitWarning', { limit });
    const queryWarnings = query.data?.warnings;
    // A merge whose join changed re-runs itself; one whose legs changed
    // waits for the user, and the rows on screen have to say so.
    const { sinceResults: mergeChangeSinceResults } = useMergeChangeSinceRun();
    const showMergeOutOfDate = mergeChangeSinceResults === 'sources';

    const savedChart = useExplorerSelector(selectSavedChart);
    // A chart type being authored is not the chart; it finishes or cancels first.
    const isChartTypeAuthoring = useExplorerSelector(
        selectIsChartTypeAuthoring,
    );

    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);
    const connectionName = useExploreConnectionName(
        projectUuid,
        unsavedChartVersion.tableName,
    );

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
    const isModalHosted = useIsModalHosted();
    const verificationSavePrompt = useVerificationSavePrompt(savedChart);
    const hasEmbedWriteActions =
        !!embed.writeActions?.spaceUuid &&
        (!!embed.writeActions.userUuid ||
            !!embed.writeActions.serviceAccountUserUuid);
    const canCreateEmbedSavedChart =
        hasEmbedWriteActions &&
        embed.embedWriteContext?.canCreateSavedChart === true;

    const buttonDisabledMessage = useMemo(() => {
        if (isChartTypeAuthoring) {
            return t('explorerHeader.saveDisabled.finishChartType');
        }

        if (isEmbedded) {
            return canCreateEmbedSavedChart
                ? null
                : t('explorerHeader.saveDisabled.embedNotAllowed');
        }

        // A chart always needs a space to be saved to (a public space or one the user can create)
        if (userCanCreateChartsInSpace) return null;
        if (userCanCreateSpace) return null;

        // The user lacks permission to save a chart in any space
        return t('explorerHeader.saveDisabled.noPermission');
    }, [
        t,
        canCreateEmbedSavedChart,
        isChartTypeAuthoring,
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
                const message = t('explorerHeader.unsavedDashboardChanges');
                event.returnValue = message;
                return message;
            }
        };
        window.addEventListener('beforeunload', checkReload);
        return () => {
            window.removeEventListener('beforeunload', checkReload);
        };
    }, [getHasDashboardChanges, t]);

    const userCanManageCompileProject = ability.can('manage', 'CompileProject');

    return (
        <Group justify="space-between">
            {typeof onBackToDashboard === 'function' && (
                <Button
                    variant="light"
                    leftSection={<MantineIcon icon={IconArrowLeft} />}
                    onClick={onBackToDashboard}
                >
                    {backButtonLabel}
                </Button>
            )}

            <Box>
                <RefreshDbtButton />
            </Box>

            <Group gap="xs">
                <ConnectionBadge name={connectionName} />
                {showMergeOutOfDate && (
                    <Tooltip
                        w={400}
                        label={t('explorerHeader.mergeOutOfDate.tooltip')}
                        position="bottom"
                    >
                        <Badge
                            leftSection={
                                <MantineIcon
                                    icon={IconRefreshAlert}
                                    size="sm"
                                />
                            }
                            color="yellow"
                            variant="outline"
                            style={{ cursor: 'help' }}
                        >
                            {t('explorerHeader.mergeOutOfDate.badge')}
                        </Badge>
                    </Tooltip>
                )}

                {showLimitWarning && (
                    <Tooltip w={400} label={limitWarning} position="bottom">
                        <Badge
                            leftSection={
                                <MantineIcon
                                    icon={IconAlertCircle}
                                    size={'sm'}
                                />
                            }
                            color="yellow"
                            variant="outline"
                            style={{ cursor: 'help' }}
                        >
                            {t('explorerHeader.resultsMayBeIncomplete')}
                        </Badge>
                    </Tooltip>
                )}

                {userCanManageCompileProject &&
                    queryWarnings &&
                    queryWarnings.length > 0 && (
                        <QueryWarnings queryWarnings={queryWarnings} />
                    )}

                <RefreshButton size="xs" />

                {/* Saved charts save from the page header (SavedChartsHeader)
                    or the editor modal's header actions. Embeds have no such
                    header, so they keep the button ("Save changes") here */}
                {(!savedChart || (isEmbedded && !isModalHosted)) &&
                    (!isEmbedded || canCreateEmbedSavedChart) && (
                        <Tooltip
                            disabled={buttonDisabledMessage === null}
                            position="bottom"
                            label={buttonDisabledMessage}
                        >
                            <div>
                                <SaveChartButton
                                    disabled={buttonDisabledMessage !== null}
                                    verificationSavePrompt={
                                        verificationSavePrompt
                                    }
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
