import { Box, Tabs } from '@mantine/core';
import { IconCodeCircle } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import SqlViewer from './SqlViewer';

enum TabPanel {
    SQL = 'SQL',
}

const ContentNoResults: FC = () => {
    const [openPanel, setOpenPanel] = useState<TabPanel>();

    const handleOpenPanel = (panel: TabPanel) => {
        setOpenPanel(panel);
    };

    const handleClosePanel = () => {
        setOpenPanel(undefined);
    };

    return (
        <>
            <PanelGroup direction="vertical">
                <Panel order={1} minSize={30} style={{ display: 'flex' }}>
                    <SuboptimalState
                        title="No results"
                        description="Select fields and adjust filters to see results."
                    />
                </Panel>

                {openPanel === TabPanel.SQL && (
                    <>
                        <Box
                            component={PanelResizeHandle}
                            bg="gray.3"
                            h="two"
                            sx={(theme) => ({
                                transition: 'background-color 0.2s ease-in-out',
                                '&[data-resize-handle-state="hover"]': {
                                    backgroundColor: theme.colors.gray[5],
                                },
                                '&[data-resize-handle-state="drag"]': {
                                    backgroundColor: theme.colors.gray[8],
                                },
                            })}
                        />

                        <Panel
                            id="semantic-viewer-panel-sql"
                            collapsible
                            order={2}
                            defaultSize={25}
                            minSize={10}
                            onCollapse={() => setOpenPanel(undefined)}
                        >
                            <SqlViewer />
                        </Panel>
                    </>
                )}
            </PanelGroup>
            <Tabs
                color="gray"
                inverted
                allowTabDeactivation
                value={openPanel ?? null}
                onTabChange={(newTabValue: TabPanel | null) => {
                    if (newTabValue) {
                        handleOpenPanel(newTabValue);
                    } else {
                        handleClosePanel();
                    }
                }}
            >
                <Tabs.List style={{ alignItems: 'center' }} pb="two">
                    <Tabs.Tab
                        value={TabPanel.SQL}
                        h="xxl"
                        px="lg"
                        icon={<MantineIcon icon={IconCodeCircle} />}
                    >
                        View SQL
                    </Tabs.Tab>
                </Tabs.List>
            </Tabs>
        </>
    );
};

export default ContentNoResults;
