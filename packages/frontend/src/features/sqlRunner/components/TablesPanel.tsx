import { Box, LoadingOverlay, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
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
    const initialPanelSizes = [80, 20];
    const activeTable = useAppSelector((state) => state.sqlRunner.activeTable);

    // state for controlling the "still loading" message
    const [showLoadingMessage, setShowLoadingMessage] = useState(false);

    // effect to handle loading timeout
    useEffect(() => {
        let timer: NodeJS.Timeout | null = null; // initialize the timer with null
        if (isLoading) {
            // start a timer that will display the loading message after 3 seconds
            timer = setTimeout(() => {
                setShowLoadingMessage(true);
            }, 3000); // 3000ms or 3 seconds
        } else {
            // clear the timer and reset the loading message if loading stops
            setShowLoadingMessage(false);
            if (timer) {
                clearTimeout(timer);
            }
        }
        // cleanup timer on unmount or when loading stops
        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [isLoading]);

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
                                bg="gray.3"
                                h={3}
                                sx={(theme) => ({
                                    transition:
                                        'background-color 0.2s ease-in-out',
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
            )}
        </Box>
    );
};
