import { subject } from '@casl/ability';
import {
    convertReplaceableFieldMatchMapToReplaceFieldsMap,
    ExploreType,
    FeatureFlags,
    findReplaceableCustomMetrics,
    getMetrics,
} from '@lightdash/common';
import { ActionIcon, Group, HoverCard, Menu, Stack, Text } from '@mantine/core';
import {
    IconAlertTriangle,
    IconCode,
    IconDots,
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
import {
    explorerActions,
    selectAdditionalMetrics,
    selectIsVisualizationConfigOpen,
    selectSavedChart,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import {
    DeleteVirtualViewModal,
    EditVirtualViewModal,
} from '../../../features/virtualView';
import { useExplore } from '../../../hooks/useExplore';
import { useFeatureFlag } from '../../../hooks/useFeatureFlagEnabled';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import PageBreadcrumbs from '../../common/PageBreadcrumbs';
import ExploreTree from '../ExploreTree';
import LoadingSkeleton from '../ExploreTree/LoadingSkeleton';
import { ItemDetailProvider } from '../ExploreTree/TableTree/ItemDetailProvider';
import ExploreYamlModal from '../ExploreYamlModal';
import WarningsHoverCardContent from '../WarningsHoverCard';
import { useIsGitProject } from '../WriteBackModal/hooks';
import { VisualizationConfigPortalId } from './constants';

interface ExplorePanelProps {
    onBack?: () => void;
}

const ExplorePanel: FC<ExplorePanelProps> = memo(({ onBack }) => {
    const { track } = useTracking();
    const { user } = useApp();
    const [isEditVirtualViewOpen, setIsEditVirtualViewOpen] = useState(false);
    const [isDeleteVirtualViewOpen, setIsDeleteVirtualViewOpen] =
        useState(false);
    const [isViewSourceOpen, setIsViewSourceOpen] = useState(false);
    const [, startTransition] = useTransition();

    const projectUuid = useProjectUuid();
    const isGitProject = useIsGitProject(projectUuid ?? '');
    const { data: editYamlInUiFlag } = useFeatureFlag(
        FeatureFlags.EditYamlInUi,
    );

    const activeTableName = useExplorerSelector(selectTableName);
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
        isFetching,
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
        setIsViewSourceOpen(true);
    }, []);

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

    if (isFetching) {
        return <LoadingSkeleton />;
    }

    if (!explore) return null;

    // Only call `onBack` for 4XX errors, otherwise we lose URL state when there's a Network error or backend is down
    if (status === 'error' && error.error.statusCode < 500) {
        onBack?.();
        return null;
    }

    return (
        <>
            <Stack
                id={VisualizationConfigPortalId}
                sx={{
                    flexGrow: 1,
                    overflow: 'hidden',
                    display: isVisualizationConfigOpen ? 'flex' : 'none',
                }}
            />

            <Stack
                h="100%"
                sx={{
                    flexGrow: 1,
                    display: isVisualizationConfigOpen ? 'none' : 'flex',
                }}
            >
                <Group position="apart">
                    <Group spacing="xs">
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
                    {explore.type === ExploreType.VIRTUAL && (
                        <Can
                            I="create"
                            this={subject('VirtualView', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <Menu withArrow offset={-2}>
                                <Menu.Target>
                                    <ActionIcon variant="transparent">
                                        <MantineIcon icon={IconDots} />
                                    </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Item
                                        icon={<MantineIcon icon={IconPencil} />}
                                        onClick={handleEditVirtualView}
                                    >
                                        <Text fz="xs" fw={500}>
                                            Edit virtual view
                                        </Text>
                                    </Menu.Item>
                                    <Can
                                        I="delete"
                                        this={subject('VirtualView', {
                                            organizationUuid:
                                                user.data?.organizationUuid,
                                            projectUuid,
                                        })}
                                    >
                                        <Menu.Item
                                            icon={
                                                <MantineIcon icon={IconTrash} />
                                            }
                                            color="red"
                                            onClick={handleDeleteVirtualView}
                                        >
                                            <Text fz="xs" fw={500}>
                                                Delete
                                            </Text>
                                        </Menu.Item>
                                    </Can>
                                </Menu.Dropdown>
                            </Menu>
                        </Can>
                    )}
                    {explore.type !== ExploreType.VIRTUAL &&
                        isGitProject &&
                        explore.ymlPath &&
                        editYamlInUiFlag?.enabled && (
                            <Can
                                I="view"
                                this={subject('SourceCode', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid,
                                })}
                            >
                                <Menu withArrow offset={-2}>
                                    <Menu.Target>
                                        <ActionIcon variant="transparent">
                                            <MantineIcon icon={IconDots} />
                                        </ActionIcon>
                                    </Menu.Target>
                                    <Menu.Dropdown>
                                        <Menu.Item
                                            icon={
                                                <MantineIcon icon={IconCode} />
                                            }
                                            onClick={handleViewSourceCode}
                                        >
                                            <Text fz="xs" fw={500}>
                                                View source code
                                            </Text>
                                        </Menu.Item>
                                    </Menu.Dropdown>
                                </Menu>
                            </Can>
                        )}
                </Group>

                <ItemDetailProvider>
                    <ExploreTree
                        explore={explore}
                        onSelectedFieldChange={toggleActiveField}
                    />
                </ItemDetailProvider>

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
                {isViewSourceOpen && projectUuid && activeTableName && (
                    <ExploreYamlModal
                        opened={isViewSourceOpen}
                        onClose={() => setIsViewSourceOpen(false)}
                        projectUuid={projectUuid}
                        exploreName={activeTableName}
                    />
                )}
            </Stack>
        </>
    );
});

ExplorePanel.displayName = 'ExplorePanel';

export default ExplorePanel;
