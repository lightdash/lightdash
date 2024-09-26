import { subject } from '@casl/ability';
import { ChartKind } from '@lightdash/common';
import {
    ActionIcon,
    Flex,
    Group,
    ScrollArea,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useApp } from '../../../providers/AppProvider';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectSemanticLayerInfo } from '../store/selectors';
import {
    resetState,
    setActiveChartKind,
    SidebarTabs,
} from '../store/semanticViewerSlice';
import * as SaveChart from './SaveChart';
import { SemanticViewerVizConfig } from './SemanticViewerVizConfig';
import SidebarViewFields from './SidebarViewFields';
import SidebarViews from './SidebarViews';

const Sidebar: FC = () => {
    const { features, projectUuid } = useAppSelector(selectSemanticLayerInfo);
    const { semanticLayerView, saveModalOpen } = useAppSelector(
        (state) => state.semanticViewer,
    );
    const history = useHistory();
    const { user } = useApp();
    const dispatch = useAppDispatch();

    const handleExitView = () => {
        dispatch(resetState());
    };

    const { activeSidebarTab, activeChartKind, columns } = useAppSelector(
        (state) => state.semanticViewer,
    );

    const handleSave = (slug: string) => {
        history.replace(
            `/projects/${projectUuid}/semantic-viewer/${slug}/edit`,
        );
    };

    const canManageSemanticViewer = user.data?.ability?.can(
        'manage',
        subject('SemanticViewer', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const canSaveChart = user.data?.ability?.can(
        'create',
        subject('SavedChart', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
            // TODO: this needs access that comes from saved chart (only available when view and edit mode are merged)
        }),
    );

    return (
        <Stack spacing="xs" sx={{ flex: 1, overflow: 'hidden' }}>
            <Group
                h="4xl"
                pl="sm"
                pr="md"
                bg="gray.1"
                spacing="xs"
                noWrap
                sx={(theme) => ({
                    flexShrink: 0,
                    borderBottom: `1px solid ${theme.colors.gray[3]}`,
                })}
            >
                {semanticLayerView && canManageSemanticViewer && canSaveChart && (
                    <>
                        <SaveChart.Content />
                        {saveModalOpen && (
                            <SaveChart.Modal onSave={handleSave} />
                        )}
                    </>
                )}
            </Group>

            <Stack
                display={
                    activeSidebarTab === SidebarTabs.TABLES ? 'inherit' : 'none'
                }
                spacing="xs"
                sx={{ flex: 1, overflow: 'hidden' }}
            >
                <Title order={5} fz="sm" c="gray.6" px="sm">
                    <Group spacing="xs">
                        {features.views && semanticLayerView && (
                            <Tooltip
                                variant="xs"
                                label="Back to views"
                                position="left"
                            >
                                <ActionIcon onClick={handleExitView} size="xs">
                                    <MantineIcon icon={IconChevronLeft} />
                                </ActionIcon>
                            </Tooltip>
                        )}

                        {!semanticLayerView ? 'Views' : 'Fields'}
                    </Group>
                </Title>

                <Flex
                    direction="column"
                    sx={{ flexGrow: 1, overflowY: 'auto' }}
                    px="sm"
                >
                    {!semanticLayerView ? (
                        <SidebarViews />
                    ) : (
                        <SidebarViewFields />
                    )}
                </Flex>
            </Stack>

            <ScrollArea
                offsetScrollbars
                variant="primary"
                className="only-vertical"
                sx={{
                    flex: 1,
                    display:
                        activeSidebarTab === SidebarTabs.VISUALIZATION
                            ? 'inherit'
                            : 'none',
                }}
            >
                <Stack sx={{ flex: 1, overflow: 'hidden' }} px="sm" pt="xxs">
                    <SemanticViewerVizConfig
                        selectedChartType={
                            activeChartKind ?? ChartKind.VERTICAL_BAR
                        }
                        setSelectedChartType={(value) =>
                            dispatch(setActiveChartKind(value))
                        }
                        columns={columns}
                    />
                </Stack>
            </ScrollArea>
        </Stack>
    );
};

export default Sidebar;
