import { subject } from '@casl/ability';
import { formatTimestamp, TimeFrames } from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    Flex,
    Group,
    Menu,
    Modal,
    NavLink,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconDots,
    IconFileAnalytics,
    IconHistory,
    IconInfoCircle,
} from '@tabler/icons-react';
import React, { memo, useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { useNavigate, useParams } from 'react-router';
import { EmptyState } from '../components/common/EmptyState';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
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
                    spacing="xl"
                    mah="100%"
                    sx={{ overflowY: 'hidden', flex: 1 }}
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
                    <Stack spacing="xs" sx={{ flexGrow: 1, overflowY: 'auto' }}>
                        {historyQuery.data?.history.map((version, index) => (
                            <NavLink
                                key={version.versionUuid}
                                active={
                                    version.versionUuid === selectedVersionUuid
                                }
                                icon={<MantineIcon icon={IconFileAnalytics} />}
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
                                                            <ActionIcon
                                                                sx={(
                                                                    theme,
                                                                ) => ({
                                                                    ':hover': {
                                                                        backgroundColor:
                                                                            theme
                                                                                .colors
                                                                                .gray[1],
                                                                    },
                                                                })}
                                                            >
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
                                                                icon={
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
                    <Alert
                        icon={<MantineIcon icon={IconInfoCircle} size={'md'} />}
                        title="Data freshness"
                        color="gray"
                        variant="light"
                    >
                        <p>
                            Version history preview changes chart configuration
                            and setup, but always queries the latest version of
                            the data itself
                        </p>
                    </Alert>
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

            <Modal
                opened={isRollbackModalOpen}
                onClose={() => setIsRollbackModalOpen(false)}
                withCloseButton={false}
                title={
                    <Group spacing="xs">
                        <MantineIcon icon={IconHistory} size="lg" />
                        <Title order={4}>Restore chart version</Title>
                    </Group>
                }
            >
                <Stack>
                    <Text>
                        By restoring to this chart version, a new version will
                        be generated and saved. All previous versions are still
                        safely stored and can be restored at any time.
                    </Text>
                    <Group position="right" spacing="xs">
                        <Button
                            variant="outline"
                            disabled={rollbackMutation.isLoading}
                            onClick={() => setIsRollbackModalOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            loading={rollbackMutation.isLoading}
                            onClick={() =>
                                selectedVersionUuid &&
                                rollbackMutation.mutate(selectedVersionUuid)
                            }
                            type="submit"
                        >
                            Restore
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Page>
    );
};

export default ChartHistory;
