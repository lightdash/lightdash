import { Box } from '@mantine/core';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
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
                }}
            >
                <Tables />
            </Panel>

            {activeTable && (
                <>
                    <Box
                        component={PanelResizeHandle}
                        bg="gray.3"
                        h={3}
                        sx={(theme) => ({
                            transition: 'background-color 0.2s ease-in-out',
                            '&[data-resize-handle-state="hover"]': {
                                backgroundColor: theme.colors.gray[3],
                            },
                            '&[data-resize-handle-state="drag"]': {
                                backgroundColor: theme.colors.gray[2],
                            },
                        })}
                    />

                    <Panel
                        id="sql-runner-table-fields"
                        order={2}
                        defaultSize={initialPanelSizes[1]}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        <TableFields />
                    </Panel>
                </>
            )}
        </PanelGroup>
    );
};
