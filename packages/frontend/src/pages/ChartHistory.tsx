import { subject } from '@casl/ability';
import { formatTimestamp, TimeFrames } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Flex,
    Menu,
    NavLink,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconDots, IconFileAnalytics, IconHistory } from '@tabler/icons-react';
import React, { memo, useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { useNavigate, useParams } from 'react-router';
import Callout from '../components/common/Callout';
import { EmptyState } from '../components/common/EmptyState';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import MantineModal from '../components/common/MantineModal';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import Explorer from '../components/Explorer';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
} from '../features/explorer/store';
import { useExplorerQueryEffects } from '../hooks/useExplorerQueryEffects';
import {
    useChartHistory,
    useChartVersion,
    useChartVersionRollbackMutation,
    useSavedQuery,
} from '../hooks/useSavedQuery';
import { Can } from '../providers/Ability';
import { ExplorerSection } from '../providers/Explorer/types';
import NoTableIcon from '../svgs/emptystate-no-table.svg?react';

const ChartHistoryContent = memo(() => {
    // Run the query effects hook - orchestrates all query effects
    useExplorerQueryEffects();

    return <Explorer hideHeader={true} />;
});

const ChartHistoryExplorer = memo<{ selectedVersionUuid: string | undefined }>(
    ({ selectedVersionUuid }) => {
        const { savedQueryUuid } = useParams<{ savedQueryUuid: string }>();
        const chartVersionQuery = useChartVersion(
            savedQueryUuid,
            selectedVersionUuid,
        );

        // Create store once with useState
        const [store] = useState(() => createExplorerStore());

        // Reset store state when chart version data changes
        useEffect(() => {
            if (!chartVersionQuery.data) return;

            const initialState = buildInitialExplorerState({
                initialState: {
                    parameterReferences: [],
                    parameterDefinitions: {},
                    expandedSections: [ExplorerSection.VISUALIZATION],
                    unsavedChartVersion: chartVersionQuery.data.chart,
                    modals: {
                        format: { isOpen: false },
                        additionalMetric: { isOpen: false },
                        customDimension: { isOpen: false },
                        writeBack: { isOpen: false },
                        itemDetail: { isOpen: false },
                    },
                },
                savedChart: chartVersionQuery.data.chart,
            });

            store.dispatch(explorerActions.reset(initialState));
        }, [chartVersionQuery.data, store]);

        // Early return if no data yet
        if (!chartVersionQuery.data) {
            return null;
        }

        return (
            <Provider store={store}>
                <ChartHistoryContent />
            </Provider>
        );
    },
);

const ChartHistory = () => {
    const navigate = useNavigate();
    const { savedQueryUuid, projectUuid } = useParams<{
        savedQueryUuid: string;
        projectUuid: string;
    }>();
    const [selectedVersionUuid, selectVersionUuid] = useState<string>();
    const [isRollbackModalOpen, setIsRollbackModalOpen] = useState(false);
    const chartQuery = useSavedQuery({
        id: savedQueryUuid,
    });
    const historyQuery = useChartHistory(savedQueryUuid);

    useEffect(() => {
        const currentVersion = historyQuery.data?.history[0];
        if (currentVersion && !selectedVersionUuid) {
            selectVersionUuid(currentVersion.versionUuid);
        }
    }, [selectedVersionUuid, historyQuery.data]);

    const rollbackMutation = useChartVersionRollbackMutation(savedQueryUuid, {
        onSuccess: () => {
            void navigate(
                `/projects/${projectUuid}/saved/${savedQueryUuid}/view`,
            );
        },
    });

    if (historyQuery.isInitialLoading || chartQuery.isInitialLoading) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Loading..." loading />
            </div>
        );
    }
    if (historyQuery.error || chartQuery.error) {
        return (
            <ErrorState
                error={historyQuery.error?.error || chartQuery.error?.error}
            />
        );
    }

    return (
        <Page
            title="Chart version history"
            withSidebarFooter
            withFullHeight
            withPaddedContent
            sidebar={
                <Stack
                    gap="xl"
                    mah="100%"
                    style={{ overflowY: 'hidden', flex: 1 }}
                >
                    <Flex gap="xs">
                        <PageBreadcrumbs
                            items={[
                                {
                                    title: 'Chart',
                                    to: `/projects/${projectUuid}/saved/${savedQueryUuid}/view`,
                                },
                                { title: 'Version history', active: true },
                            ]}
                        />
                    </Flex>
                    <Stack gap="xs" style={{ flexGrow: 1, overflowY: 'auto' }}>
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
                                                <Badge
                                                    size="xs"
                                                    variant="light"
                                                    color="green"
                                                >
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
                                                        {
                                                            ...chartQuery.data,
                                                        },
                                                    )}
                                                >
                                                    <Menu
                                                        withinPortal
                                                        position="bottom-start"
                                                        withArrow
                                                        arrowPosition="center"
                                                        shadow="md"
                                                        offset={-4}
                                                        closeOnItemClick
                                                        closeOnClickOutside
                                                    >
                                                        <Menu.Target>
                                                            <ActionIcon variant="subtle">
                                                                <IconDots
                                                                    size={16}
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
                                                                    <IconHistory
                                                                        size={
                                                                            18
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
                    <Callout variant="info" title="Data freshness">
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
            </MantineModal>
        </Page>
    );
};

export default ChartHistory;
