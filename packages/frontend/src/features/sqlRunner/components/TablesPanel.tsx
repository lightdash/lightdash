import { Box } from '@mantine/core';
import { IconGripHorizontal } from '@tabler/icons-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppSelector } from '../store/hooks';
import { TableFields } from './TableFields';
import { Tables } from './Tables';

export const TablesPanel = () => {
    const initialPanelSizes = [80, 20];
    const activeTable = useAppSelector((state) => state.sqlRunner.activeTable);
    return (
        <PanelGroup direction="vertical">
            <Panel
                id="sql-runner-tables"
                order={1}
                defaultSize={initialPanelSizes[0]}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '0px 14px',
                }}
            >
                <Tables />
            </Panel>

            {activeTable && (
                <>
                    <Box
                        component={PanelResizeHandle}
                        bg="gray.1"
                        h={6}
                        sx={(theme) => ({
                            transition: 'background-color 0.2s ease-in-out',
                            cursor: 'row-resize',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            '&:hover': {
                                backgroundColor: theme.colors.gray[2],
                            },
                            '&[data-resize-handle-state="drag"]': {
                                backgroundColor: theme.colors.gray[3],
                            },
                        })}
                    >
                        <MantineIcon
                            color="gray"
                            icon={IconGripHorizontal}
                            size={8}
                        />
                    </Box>

                    <Panel
                        id="sql-runner-table-fields"
                        order={2}
                        defaultSize={initialPanelSizes[1]}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '0px 14px',
                        }}
                    >
                        <TableFields />
                    </Panel>
                </>
            )}
        </PanelGroup>
    );
};
