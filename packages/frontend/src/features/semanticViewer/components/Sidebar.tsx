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
import MantineIcon from '../../../components/common/MantineIcon';
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
    const { features } = useAppSelector(selectSemanticLayerInfo);
    const { view, saveModalOpen } = useAppSelector(
        (state) => state.semanticViewer,
    );
    const dispatch = useAppDispatch();

    const handleExitView = () => {
        dispatch(resetState());
    };

    const { activeSidebarTab, activeChartKind, columns } = useAppSelector(
        (state) => state.semanticViewer,
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
                {view && (
                    <>
                        <SaveChart.Content />
                        {saveModalOpen && <SaveChart.Modal />}
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
                        {features.views && view && (
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

                        {!view ? 'Views' : 'Fields'}
                    </Group>
                </Title>

                <Flex
                    direction="column"
                    sx={{ flexGrow: 1, overflowY: 'auto' }}
                    px="sm"
                    pt="xxs"
                >
                    {!view ? <SidebarViews /> : <SidebarViewFields />}
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
