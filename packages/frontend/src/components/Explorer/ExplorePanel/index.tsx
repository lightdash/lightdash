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
    selectMetricQuery,
    selectSavedChart,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { ExternalSourceBadge } from '../../../features/externalSources/components/ExternalSourceBadge';
import { ExternalSourceExploreMenu } from '../../../features/externalSources/components/ExternalSourceExploreMenu';
import { JoinWithWarehouseHint } from '../../../features/externalSources/components/JoinWithWarehouseHint';
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
import ExploreTree from '../ExploreTree';
import LoadingSkeleton from '../ExploreTree/LoadingSkeleton';
import { ItemDetailProvider } from '../ExploreTree/TableTree/ItemDetailProvider';
import WarningsHoverCardContent from '../WarningsHoverCardContent';
import { useIsGitProject } from '../WriteBackModal/hooks';
import classes from './index.module.css';

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
            <Stack
                h="100%"
                className={classes.panel}
                // Walkthrough look for manage:Explore: the table's fields,
                // seen once the table is open and before any is picked.
                data-tour-scope="manage:Explore"
                data-tour-look="1"
                data-tour-after='[data-tour-anchor="explore-table"]'
                data-tour-label="The fields you can query"
                data-tour-docs="explore/explore-view.mdx#the-explore-page:li1"
            >
                {merge?.isMerging && merge.readOnly && <MergeJoinBar />}
                {/* The breadcrumbs, warnings and menu all belong to the
                    primary source's explore; shown above an added source's
                    picker they read as its header, which they are not. */}
                <Group
                    data-tour-scope="manage:VirtualView"
                    data-tour-step="1"
                    data-tour-route="/projects/:projectUuid/tables/:tableName"
                    data-tour-label="Inspect the updated virtual view"
                    data-tour-busy='[data-tour-anchor="virtual-view-editor"]'
                    data-tour-docs="semantic-layer/virtual-views.mdx#edit-or-delete-a-virtual-view:1"
                    data-tour-return="none"
                    data-tour-resultdocs="semantic-layer/virtual-views.mdx#edit-or-delete-a-virtual-view:p2:1"
                    justify="space-between"
                    display={isGuidedMerge ? 'none' : undefined}
                >
                    <Group gap="xs">
                        <PageBreadcrumbs size="md" items={breadcrumbs} />
                        {explore.type === ExploreType.EXTERNAL_SOURCE &&
                            explore.externalSource && (
                                <ExternalSourceBadge
                                    sourceRef={explore.externalSource}
                                />
                            )}
                        {explore.warnings && explore.warnings.length > 0 && (
                            <HoverCard position="right" withArrow>
                                <HoverCard.Target>
                                    <ActionIcon color="yellow" size="sm">
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
                                        data-tour-anchor="virtual-view-actions"
                                        data-tour-hint="Open virtual view actions"
                                        aria-label="Virtual view actions"
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
                                            data-tour-anchor="virtual-view-edit"
                                            data-tour-hint="Edit the virtual view"
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
                                                data-tour-scope="delete:VirtualView"
                                                data-tour-step="2"
                                                data-tour-route="/projects/:projectUuid/tables/:tableName"
                                                data-tour-title="Delete a virtual view"
                                                data-tour-label="Delete the virtual view"
                                                data-tour-docs="semantic-layer/virtual-views.mdx#edit-or-delete-a-virtual-view:1"
                                                data-tour-interactive="true"
                                                data-tour-via='[data-tour-nav="new"] >> [data-tour-nav="new-sql-runner"] >> [data-tour-anchor="sql-runner-editor"] >> [data-tour-anchor="sql-runner-run"] >> [data-tour-anchor="sql-cta-menu"] >> [data-tour-anchor="sql-cta-virtual-view"] >> [data-tour-anchor="sql-create-virtual-view"] >> [data-tour-anchor="virtual-view-name"] >> [data-tour-anchor="virtual-view-create-submit"] >> [data-tour-nav="new"] >> [data-tour-nav="new-chart"] >> [data-tour-anchor="explore-search"] >> [data-tour-anchor="explore-section"][data-tour-value="Virtual Views"] >> [data-tour-anchor="explore-table"][data-tour-value="Orders by status"] >> [data-tour-anchor="virtual-view-actions"]'
                                                data-tour-then='[data-tour-anchor="modal-confirm"]'
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
                    {explore.type === ExploreType.EXTERNAL_SOURCE &&
                        explore.externalSource &&
                        projectUuid && (
                            <ExternalSourceExploreMenu
                                projectUuid={projectUuid}
                                explore={explore}
                                sourceRef={explore.externalSource}
                                canMergeAnotherQuery={canMergeAnotherQuery}
                                onAddMergeSource={handleAddMergeSource}
                            />
                        )}
                    {explore.type !== ExploreType.EXTERNAL_SOURCE &&
                        (canViewSourceCode || canMergeAnotherQuery) && (
                            <Menu withArrow offset={-2}>
                                <Menu.Target>
                                    <ActionIcon
                                        aria-label="Query options"
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
                                    {canViewSourceCode &&
                                        canMergeAnotherQuery && (
                                            <Menu.Divider />
                                        )}
                                    {canMergeAnotherQuery && (
                                        <Menu.Item
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconGitMerge}
                                                />
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

                {explore.type === ExploreType.EXTERNAL_SOURCE &&
                    canMergeAnotherQuery &&
                    !isGuidedMerge && (
                        <Group>
                            <JoinWithWarehouseHint
                                onClick={handleAddMergeSource}
                            />
                        </Group>
                    )}

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
