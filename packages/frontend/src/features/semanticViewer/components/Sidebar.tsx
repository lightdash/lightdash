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
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { selectSemanticLayerInfo } from '../store/selectors';
import {
    resetState,
    setActiveChartKind,
    SidebarTabs,
} from '../store/semanticViewerSlice';
import SaveSemanticViewerChartModal from './Modals/SaveSemanticViewerChartModal';
import SaveSemanticViewerChart from './SaveSemanticViewerChart';
import { SemanticViewerVizConfig } from './SemanticViewerVizConfig';
import SidebarViewFields from './SidebarViewFields';
import SidebarViews from './SidebarViews';

type SidebarProps = {
    shouldShowSave?: boolean;
};

const Sidebar: FC<SidebarProps> = ({ shouldShowSave }) => {
    const { features, projectUuid } = useAppSelector(selectSemanticLayerInfo);
    const { semanticLayerView, saveModalOpen } = useAppSelector(
        (state) => state.semanticViewer,
    );
    const history = useHistory();
    const dispatch = useAppDispatch();

    const handleExitView = () => {
        dispatch(resetState());
    };

    const { activeSidebarTab, activeChartKind, columns } = useAppSelector(
        (state) => state.semanticViewer,
    );

    const handleCreate = (slug: string) => {
        history.replace(`/projects/${projectUuid}/semantic-viewer/${slug}`);
    };

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
                {semanticLayerView && shouldShowSave && (
                    <>
                        <SaveSemanticViewerChart />
                        {saveModalOpen && (
                            <SaveSemanticViewerChartModal
                                onSave={handleCreate}
                            />
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
