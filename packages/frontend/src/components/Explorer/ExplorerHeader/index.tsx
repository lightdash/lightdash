import { subject } from '@casl/ability';
import { Badge, Box, Button, Group, Tooltip } from '@mantine/core';
import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import { memo, useEffect, useMemo, type FC } from 'react';
import useEmbed from '../../../ee/providers/Embed/useEmbed';
import {
    selectIsChartTypeAuthoring,
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
import { useVerificationSavePrompt } from '../../../hooks/useVerificationSavePrompt';
import { Can } from '../../../providers/Ability';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';
import { useIsModalHosted } from '../../../providers/Explorer/useIsModalHosted';
import MantineIcon from '../../common/MantineIcon';
import ShareShortLinkButton from '../../common/ShareShortLinkButton';
import { RefreshButton } from '../../RefreshButton';
import RefreshDbtButton from '../../RefreshDbtButton';
import SaveChartButton from '../SaveChartButton';
import QueryWarnings from './QueryWarnings';

const ExplorerHeader: FC = memo(() => {
    const projectUuid = useProjectUuid();
    const { user } = useApp();
    const { content, onBackToDashboard } = useEmbed();
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
    // A chart type being authored is not the chart; it finishes or cancels first.
    const isChartTypeAuthoring = useExplorerSelector(
        selectIsChartTypeAuthoring,
    );

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
            return 'Finish editing the chart type first';
        }

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
    const backButtonLabel =
        content?.type === 'aiAgent'
            ? 'Back to AI'
            : content?.type === 'metricsCatalog'
              ? 'Back to Metrics Catalog'
              : 'Back to Dashboard';

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
                {showLimitWarning && (
                    <Tooltip
                        w={400}
                        label={`Query limit of ${limit} reached. There may be additional results that have not been displayed. To see more, increase the query limit or try narrowing filters.`}
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

                {/* For saved charts the main app saves from SavedChartsHeader.
                    Embeds and modal hosts have no such header, so they edit
                    saved charts here and keep the button ("Save changes") */}
                {(!savedChart || isEmbedded || isModalHosted) &&
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
