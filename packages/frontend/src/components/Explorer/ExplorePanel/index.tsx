import { subject } from '@casl/ability';
import {
    convertReplaceableFieldMatchMapToReplaceFieldsMap,
    ExploreType,
    FeatureFlags,
    findReplaceableCustomMetrics,
    getMetrics,
} from '@lightdash/common';
import { Group, Menu, Stack, Text, ActionIcon, HoverCard } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAlertTriangle,
    IconCode,
    IconDots,
    IconGitMerge,
    IconPencil,
    IconTrash,
} from '@tabler/icons-react';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useState,
    useTransition,
    type FC,
} from 'react';
import VirtualViewAsCodeModal from '../../../features/contentAsCode/components/VirtualViewAsCodeModal';
import {
    explorerActions,
    selectAdditionalMetrics,
    selectIsVisualizationConfigOpen,
    selectMetricQuery,
    selectSavedChart,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { MergeJoinBar } from '../../../features/mergeQuery/components/MergeJoinBar';
import { MergeQuerySidebar } from '../../../features/mergeQuery/components/MergeQuerySidebar';
import {
    DEFAULT_ADDITIONAL_SOURCE_ID,
    PRIMARY_SOURCE_ID,
} from '../../../features/mergeQuery/constants';
import { useMergeSafe } from '../../../features/mergeQuery/context/useMerge';
import { isMergeSourceReady } from '../../../features/mergeQuery/utils/mergeWorkflow';
import { useSourceCodeEditor } from '../../../features/sourceCodeEditor';
import {
    DeleteVirtualViewModal,
    EditVirtualViewModal,
} from '../../../features/virtualView';
import { useExplore } from '../../../hooks/useExplore';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import PageBreadcrumbs from '../../common/PageBreadcrumbs';
import { useIsChartGalleryEnabled } from '../ChartGallery/useIsChartGalleryEnabled';
import ExploreTree from '../ExploreTree';
import LoadingSkeleton from '../ExploreTree/LoadingSkeleton';
import { ItemDetailProvider } from '../ExploreTree/TableTree/ItemDetailProvider';
import VisualizationConfigPortal from '../VisualizationCard/VisualizationConfigPortal';
import WarningsHoverCardContent from '../WarningsHoverCardContent';
import { useIsGitProject } from '../WriteBackModal/hooks';

interface ExplorePanelProps {
    onBack?: () => void;
}

const ExplorePanel: FC<ExplorePanelProps> = memo(({ onBack }) => {
    const { track } = useTracking();
    const { user } = useApp();
    const [isEditVirtualViewOpen, setIsEditVirtualViewOpen] = useState(false);
    const [isDeleteVirtualViewOpen, setIsDeleteVirtualViewOpen] =
        useState(false);
    const [isVirtualViewAsCodeOpen, virtualViewAsCodeModalHandlers] =
        useDisclosure();
    const [, startTransition] = useTransition();

    const projectUuid = useProjectUuid();
    const isGitProject = useIsGitProject(projectUuid ?? '');
    const { open: openSourceCodeEditor } = useSourceCodeEditor();
    const { data: editYamlInUiFlag } = useServerFeatureFlag(
        FeatureFlags.EditYamlInUi,
    );
    const { data: mergeFlag } = useServerFeatureFlag(FeatureFlags.MergeQueries);
    const isChartGalleryEnabled = useIsChartGalleryEnabled();
    const merge = useMergeSafe();
    const additionalSource = merge?.additionalSources[0];
    const [isChoosingMergeExplore, setIsChoosingMergeExplore] = useState(
        !additionalSource?.exploreName,
    );
    useEffect(() => {
        if (!additionalSource?.exploreName) setIsChoosingMergeExplore(true);
    }, [additionalSource?.exploreName]);
    const isGuidedMerge =
        mergeFlag?.enabled === true &&
        merge?.isMerging === true &&
        !merge.readOnly;
    const activeTableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);

    // Get savedChart from Redux
    const savedChart = useExplorerSelector(selectSavedChart);
    const chartUuid = savedChart?.uuid;

    const dispatch = useExplorerDispatch();

    const toggleActiveField = useCallback(
        (fieldId: string, isDimension: boolean) => {
            if (isDimension) {
                dispatch(explorerActions.toggleDimension(fieldId));
            } else {
                dispatch(explorerActions.toggleMetric(fieldId));
            }
        },
        [dispatch],
    );

    const isVisualizationConfigOpen = useExplorerSelector(
        selectIsVisualizationConfigOpen,
    );

    const {
        data: explore,
        isInitialLoading,
        status,
        error,
    } = useExplore(activeTableName);

    useEffect(() => {
        if (
            projectUuid &&
            user.data?.organizationUuid &&
            explore &&
            additionalMetrics
        ) {
            const replaceableFieldsMap = findReplaceableCustomMetrics({
                metrics: getMetrics(explore),
                customMetrics: additionalMetrics,
            });
            const fieldsToReplace =
                convertReplaceableFieldMatchMapToReplaceFieldsMap(
                    replaceableFieldsMap,
                );
            if (fieldsToReplace) {
                dispatch(
                    explorerActions.replaceFields({
                        fieldsToReplace: {
                            customMetrics: fieldsToReplace,
                        },
                    }),
                );
                track({
                    name: EventName.CUSTOM_FIELDS_REPLACEMENT_APPLIED,
                    properties: {
                        userId: user.data.userUuid,
                        projectId: projectUuid,
                        organizationId: user.data.organizationUuid,
                        chartId: chartUuid,
                        customMetricIds: Object.keys(fieldsToReplace),
                    },
                });
            }
        }
    }, [
        explore,
        additionalMetrics,
        dispatch,
        track,
        user,
        projectUuid,
        chartUuid,
    ]);

    const handleEditVirtualView = useCallback(() => {
        startTransition(() => setIsEditVirtualViewOpen(true));
    }, []);

    const handleDeleteVirtualView = useCallback(() => {
        setIsDeleteVirtualViewOpen(true);
    }, []);

    const handleViewSourceCode = useCallback(() => {
        if (!activeTableName) return;
        openSourceCodeEditor({ explore: activeTableName });
    }, [openSourceCodeEditor, activeTableName]);

    const handleAddMergeSource = useCallback(() => {
        if (!merge) return;
        merge.addSource(DEFAULT_ADDITIONAL_SOURCE_ID, {
            kind: 'source',
            sourceId: isMergeSourceReady(metricQuery)
                ? DEFAULT_ADDITIONAL_SOURCE_ID
                : PRIMARY_SOURCE_ID,
        });
    }, [merge, metricQuery]);

    const breadcrumbs = useMemo(() => {
        if (!explore) return [];
        const items = onBack
            ? [
                  { title: 'Tables', onClick: onBack },
                  { title: explore.label, active: true },
              ]
            : [{ title: explore.label, active: true }];
        return items;
    }, [onBack, explore]);

    if (isInitialLoading) {
        return <LoadingSkeleton />;
    }

    if (!explore) return null;

    const virtualViewSubject = subject('VirtualView', {
        organizationUuid: user.data?.organizationUuid,
        projectUuid,
    });
    const canEditVirtualView = user.data?.ability.can(
        'create',
        virtualViewSubject,
    );
    const canDeleteVirtualView = user.data?.ability.can(
        'delete',
        virtualViewSubject,
    );
    const canViewContentAsCode = user.data?.ability.can(
        'view',
        subject('ContentAsCode', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
    const canViewSourceCode =
        explore.type !== ExploreType.VIRTUAL &&
        isGitProject &&
        !!explore.ymlPath &&
        editYamlInUiFlag?.enabled === true &&
        user.data?.ability.can(
            'view',
            subject('SourceCode', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        ) === true;
    const canMergeAnotherQuery =
        explore.type !== ExploreType.VIRTUAL &&
        mergeFlag?.enabled === true &&
        !!merge &&
        !merge.isMerging &&
        !merge.readOnly;

    // Only call `onBack` for 4XX errors, otherwise we lose URL state when there's a Network error or backend is down
    if (status === 'error' && error.error.statusCode < 500) {
        onBack?.();
        return null;
    }

    return (
        <>
            {!isChartGalleryEnabled && (
                <VisualizationConfigPortal active={isVisualizationConfigOpen} />
            )}

            <Stack
                h="100%"
                style={{
                    flexGrow: 1,
                    display:
                        !isChartGalleryEnabled && isVisualizationConfigOpen
                            ? 'none'
                            : 'flex',
                }}
            >
                {merge?.isMerging && merge.readOnly && <MergeJoinBar />}
                {/* The breadcrumbs, warnings and menu all belong to the
                    primary source's explore; shown above an added source's
                    picker they read as its header, which they are not. */}
                <Group
                    justify="space-between"
                    display={isGuidedMerge ? 'none' : undefined}
                >
                    <Group gap="xs">
                        <PageBreadcrumbs size="md" items={breadcrumbs} />
                        {explore.warnings && explore.warnings.length > 0 && (
                            <HoverCard
                                withinPortal
                                position="right"
                                withArrow
                                radius="md"
                                shadow="subtle"
                            >
                                <HoverCard.Target>
                                    <ActionIcon
                                        variant="subtle"
                                        color="yellow"
                                        size="sm"
                                    >
                                        <MantineIcon
                                            icon={IconAlertTriangle}
                                            color="yellow.9"
                                        />
                                    </ActionIcon>
                                </HoverCard.Target>
                                <HoverCard.Dropdown maw={400} p="xs">
                                    <WarningsHoverCardContent
                                        type="warnings"
                                        warnings={explore.warnings}
                                    />
                                </HoverCard.Dropdown>
                            </HoverCard>
                        )}
                    </Group>
                    {explore.type === ExploreType.VIRTUAL &&
                        (canEditVirtualView ||
                            canDeleteVirtualView ||
                            canViewContentAsCode) && (
                            <Menu withArrow offset={-2}>
                                <Menu.Target>
                                    <ActionIcon
                                        aria-label="Virtual view actions"
                                        color="gray"
                                        variant="transparent"
                                    >
                                        <MantineIcon icon={IconDots} />
                                    </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    {canEditVirtualView && (
                                        <Menu.Item
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconPencil}
                                                />
                                            }
                                            onClick={handleEditVirtualView}
                                        >
                                            <Text fz="xs" fw={500}>
                                                Edit virtual view
                                            </Text>
                                        </Menu.Item>
                                    )}
                                    {canViewContentAsCode && (
                                        <>
                                            {canEditVirtualView && (
                                                <Menu.Divider />
                                            )}
                                            <Menu.Label>
                                                Content as code
                                            </Menu.Label>
                                            <Menu.Item
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconCode}
                                                    />
                                                }
                                                onClick={
                                                    virtualViewAsCodeModalHandlers.open
                                                }
                                            >
                                                View as code
                                            </Menu.Item>
                                        </>
                                    )}
                                    {canDeleteVirtualView && (
                                        <>
                                            <Menu.Divider />
                                            <Menu.Item
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconTrash}
                                                    />
                                                }
                                                color="red"
                                                onClick={
                                                    handleDeleteVirtualView
                                                }
                                            >
                                                <Text fz="xs" fw={500}>
                                                    Delete
                                                </Text>
                                            </Menu.Item>
                                        </>
                                    )}
                                </Menu.Dropdown>
                            </Menu>
                        )}
                    {(canViewSourceCode || canMergeAnotherQuery) && (
                        <Menu withArrow offset={-2}>
                            <Menu.Target>
                                <ActionIcon
                                    aria-label="Query options"
                                    color="gray"
                                    variant="transparent"
                                >
                                    <MantineIcon icon={IconDots} />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                {canViewSourceCode && (
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon icon={IconCode} />
                                        }
                                        onClick={handleViewSourceCode}
                                    >
                                        <Text fz="xs" fw={500}>
                                            View source code
                                        </Text>
                                    </Menu.Item>
                                )}
                                {canViewSourceCode && canMergeAnotherQuery && (
                                    <Menu.Divider />
                                )}
                                {canMergeAnotherQuery && (
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon icon={IconGitMerge} />
                                        }
                                        onClick={handleAddMergeSource}
                                    >
                                        <Text fz="xs" fw={500}>
                                            Merge another query
                                        </Text>
                                    </Menu.Item>
                                )}
                            </Menu.Dropdown>
                        </Menu>
                    )}
                </Group>

                {isGuidedMerge ? (
                    <MergeQuerySidebar
                        primaryExplore={explore}
                        onPrimaryFieldChange={toggleActiveField}
                        isChoosingAdditionalExplore={isChoosingMergeExplore}
                        setIsChoosingAdditionalExplore={
                            setIsChoosingMergeExplore
                        }
                    />
                ) : (
                    <ItemDetailProvider>
                        <ExploreTree
                            explore={explore}
                            onSelectedFieldChange={toggleActiveField}
                        />
                    </ItemDetailProvider>
                )}

                {isEditVirtualViewOpen && (
                    <EditVirtualViewModal
                        opened={isEditVirtualViewOpen}
                        onClose={() => setIsEditVirtualViewOpen(false)}
                        activeTableName={activeTableName}
                        setIsEditVirtualViewOpen={setIsEditVirtualViewOpen}
                        explore={explore}
                    />
                )}
                {isDeleteVirtualViewOpen && projectUuid && (
                    <DeleteVirtualViewModal
                        opened={isDeleteVirtualViewOpen}
                        onClose={() => setIsDeleteVirtualViewOpen(false)}
                        virtualViewName={activeTableName}
                        projectUuid={projectUuid}
                    />
                )}
                {projectUuid && isVirtualViewAsCodeOpen && (
                    <VirtualViewAsCodeModal
                        opened={isVirtualViewAsCodeOpen}
                        onClose={virtualViewAsCodeModalHandlers.close}
                        projectUuid={projectUuid}
                        virtualViewSlug={activeTableName}
                    />
                )}
            </Stack>
        </>
    );
});

ExplorePanel.displayName = 'ExplorePanel';

export default ExplorePanel;
