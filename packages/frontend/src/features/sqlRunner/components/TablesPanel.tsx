import { Box, LoadingOverlay, Text } from '@mantine/core';
import { useTimeout } from '@mantine/hooks';
import { IconGripHorizontal } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppSelector } from '../store/hooks';
import { TableFields } from './TableFields';
import { Tables } from './Tables';

type TablesPanelProps = {
    isLoading: boolean;
    error: string | null;
};

export const TablesPanel: React.FC<TablesPanelProps> = ({
    isLoading,
    error,
}) => {
    const initialPanelSizes = [50, 50];
    const activeTable = useAppSelector((state) => state.sqlRunner.activeTable);

    // state for controlling the "still loading" message
    const [showLoadingMessage, setShowLoadingMessage] = useState(false);

    const { start, clear } = useTimeout(
        () => setShowLoadingMessage(true),
        3000,
    );

    useEffect(() => {
        if (isLoading) {
            setShowLoadingMessage(false);
            start();
        } else {
            clear();
            setShowLoadingMessage(false);
        }
    }, [isLoading, start, clear]);

    return (
        <Box sx={{ position: 'relative', flex: 1 }}>
            <LoadingOverlay visible={isLoading} />

            {error && (
                <Text color="red" align="center">
                    {error}
                </Text>
            )}

            {isLoading && showLoadingMessage && (
                <Text color="gray.9" align="center">
                    Hang on, still loading...
                </Text>
            )}

            {!isLoading && !error && (
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
                                bg="gray.1"
                                h={6}
                                sx={(theme) => ({
                                    transition:
                                        'background-color 0.2s ease-in-out',
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
                                }}
                            >
                                <TableFields />
                            </Panel>
                        </>
                    )}
                </PanelGroup>
            )}
        </Box>
    );
};
