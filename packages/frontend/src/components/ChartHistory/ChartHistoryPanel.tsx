import { subject } from '@casl/ability';
import {
    formatTimestamp,
    TimeFrames,
    type SavedChart,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Menu,
    NavLink,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconDots, IconFileAnalytics, IconHistory } from '@tabler/icons-react';
import { memo, useEffect, useState, type FC, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import ChartVersionPreviewProvider from '../../features/apps/ChartVersionPreview/ChartVersionPreviewProvider';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
} from '../../features/explorer/store';
import { MergeProvider } from '../../features/mergeQuery/context/MergeContext';
import { useExplorerQueryEffects } from '../../hooks/useExplorerQueryEffects';
import {
    getSavedQuery,
    useChartHistory,
    useChartVersion,
    useChartVersionRollbackMutation,
} from '../../hooks/useSavedQuery';
import { Can } from '../../providers/Ability';
import useApp from '../../providers/App/useApp';
import { ExplorerSection } from '../../providers/Explorer/types';
import NoTableIcon from '../../svgs/emptystate-no-table.svg?react';
import Callout from '../common/Callout';
import { EmptyState } from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import Page from '../common/Page/Page';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import Explorer from '../Explorer';
import classes from './ChartHistoryPanel.module.css';

const ChartHistoryContent = memo(() => {
    // Run the query effects hook - orchestrates all query effects
    useExplorerQueryEffects();

    return (
        <MergeProvider>
            <Explorer hideHeader={true} />
        </MergeProvider>
    );
});

type ChartHistoryExplorerProps = {
    chartUuid: string;
    selectedVersionUuid: string | undefined;
};

const ChartHistoryExplorer = memo<ChartHistoryExplorerProps>(
    ({ chartUuid, selectedVersionUuid }) => {
        const { health } = useApp();
        const chartVersionQuery = useChartVersion(
            chartUuid,
            selectedVersionUuid,
        );
        const defaultLimit = health.data?.query.defaultLimit;

        // Create store once with useState
        const [store] = useState(() => createExplorerStore());

        // Reset store state when chart version data changes
        useEffect(() => {
            if (!chartVersionQuery.data) return;

            // Same session the chart page builds, so the previewed version
            // carries its own parameters and colour palette.
            const initialState = buildInitialExplorerState({
                savedChart: chartVersionQuery.data.chart,
                isEditMode: false,
                expandedSections: [ExplorerSection.VISUALIZATION],
                defaultLimit,
            });

            store.dispatch(explorerActions.reset(initialState));
        }, [chartVersionQuery.data, defaultLimit, store]);

        // Early return if no data yet
        if (!chartVersionQuery.data) {
            return null;
        }

        return (
            <Provider store={store}>
                <ChartVersionPreviewProvider
                    versionUuid={chartVersionQuery.data.versionUuid}
                >
                    <ChartHistoryContent />
                </ChartVersionPreviewProvider>
            </Provider>
        );
    },
);

type Props = {
    chart: SavedChart;
    projectUuid: string;
    /** Rendered above the version list; the page puts its breadcrumbs here. */
    sidebarHeader: ReactNode;
    /** The host editor holds edits a restore would discard; the confirm says so. */
    hasUnsavedEdits: boolean;
    /** Called with the chart as saved after the restore. */
    onRestored: (chart: SavedChart) => void;
    /** The panel sits in a modal, so its page sizes to the container. */
    withContainerHeight: boolean;
};

/**
 * Version list with a preview of the selected version and a restore flow.
 * Route-free so the chart page and the in-dashboard editor share it.
 */
const ChartHistoryPanel: FC<Props> = ({
    chart,
    projectUuid,
    sidebarHeader,
    hasUnsavedEdits,
    onRestored,
    withContainerHeight,
}) => {
    const [userSelectedVersionUuid, selectVersionUuid] = useState<string>();
    const [isRollbackModalOpen, setIsRollbackModalOpen] = useState(false);
    const historyQuery = useChartHistory(chart.uuid);
    // The current version is selected until the user picks another
    const selectedVersionUuid =
        userSelectedVersionUuid ?? historyQuery.data?.history[0]?.versionUuid;

    const rollbackMutation = useChartVersionRollbackMutation(chart.uuid, {
        onSuccess: async () => {
            onRestored(await getSavedQuery(chart.uuid, projectUuid));
        },
    });

    if (historyQuery.isInitialLoading) {
        return (
            <Box mt="md">
                <SuboptimalState title="Loading..." loading />
            </Box>
        );
    }
    if (historyQuery.error) {
        return <ErrorState error={historyQuery.error.error} />;
    }

    return (
        <Page
            withSidebarFooter
            withFullHeight
            withPaddedContent
            withContainerHeight={withContainerHeight}
            sidebar={
                <Stack gap="xl" mah="100%" flex={1} className={classes.sidebar}>
                    {sidebarHeader}
                    <Stack
                        gap="xs"
                        flex="1 1 auto"
                        className={classes.versionList}
                    >
                        {historyQuery.data?.history.map((version, index) => (
                            <NavLink
                                key={version.versionUuid}
                                active={
                                    version.versionUuid === selectedVersionUuid
                                }
                                leftSection={
                                    <MantineIcon icon={IconFileAnalytics} />
                                }
                                label={formatTimestamp(
                                    version.createdAt,
                                    TimeFrames.SECOND,
                                )}
                                description={
                                    <Text>
                                        Updated by:{' '}
                                        {version.createdBy?.firstName}{' '}
                                        {version.createdBy?.lastName}
                                    </Text>
                                }
                                rightSection={
                                    <>
                                        {index === 0 && (
                                            <Tooltip
                                                label={`This is the current version.`}
                                            >
                                                <Badge size="xs" color="green">
                                                    current
                                                </Badge>
                                            </Tooltip>
                                        )}
                                        {index !== 0 &&
                                            version.versionUuid ===
                                                selectedVersionUuid && (
                                                <Can
                                                    I="manage"
                                                    this={subject(
                                                        'SavedChart',
                                                        { ...chart },
                                                    )}
                                                >
                                                    <Menu
                                                        position="bottom-start"
                                                        withArrow
                                                        arrowPosition="center"
                                                        offset={-4}
                                                        closeOnItemClick
                                                        closeOnClickOutside
                                                    >
                                                        <Menu.Target>
                                                            <ActionIcon aria-label="Version actions">
                                                                <MantineIcon
                                                                    icon={
                                                                        IconDots
                                                                    }
                                                                />
                                                            </ActionIcon>
                                                        </Menu.Target>

                                                        <Menu.Dropdown
                                                            maw={320}
                                                        >
                                                            <Menu.Item
                                                                component="button"
                                                                role="menuitem"
                                                                leftSection={
                                                                    <MantineIcon
                                                                        icon={
                                                                            IconHistory
                                                                        }
                                                                    />
                                                                }
                                                                onClick={() => {
                                                                    setIsRollbackModalOpen(
                                                                        true,
                                                                    );
                                                                }}
                                                            >
                                                                Restore this
                                                                version
                                                            </Menu.Item>
                                                        </Menu.Dropdown>
                                                    </Menu>
                                                </Can>
                                            )}
                                    </>
                                }
                                onClick={() =>
                                    selectVersionUuid(version.versionUuid)
                                }
                            />
                        ))}
                    </Stack>
                    <Callout
                        variant="info"
                        title="Data freshness"
                        flex="0 0 auto"
                    >
                        Version history preview changes chart configuration and
                        setup, but always queries the latest version of the data
                        itself
                    </Callout>
                </Stack>
            }
        >
            {!selectedVersionUuid && (
                <EmptyState
                    maw={500}
                    icon={<NoTableIcon />}
                    title="Select a version"
                />
            )}
            {selectedVersionUuid && (
                <ChartHistoryExplorer
                    key={selectedVersionUuid}
                    chartUuid={chart.uuid}
                    selectedVersionUuid={selectedVersionUuid}
                />
            )}

            <MantineModal
                opened={isRollbackModalOpen}
                onClose={() => setIsRollbackModalOpen(false)}
                title="Restore chart version"
                icon={IconHistory}
                cancelDisabled={rollbackMutation.isLoading}
                actions={
                    <Button
                        loading={rollbackMutation.isLoading}
                        onClick={() =>
                            selectedVersionUuid &&
                            rollbackMutation.mutate(selectedVersionUuid)
                        }
                        color="red"
                    >
                        Restore
                    </Button>
                }
            >
                <Text>
                    By restoring to this chart version, a new version will be
                    generated and saved. All previous versions are still safely
                    stored and can be restored at any time.
                </Text>
                {hasUnsavedEdits && (
                    <Text mt="sm" fw={500}>
                        Your unsaved edits in the chart editor will be
                        discarded.
                    </Text>
                )}
            </MantineModal>
        </Page>
    );
};

export default ChartHistoryPanel;
