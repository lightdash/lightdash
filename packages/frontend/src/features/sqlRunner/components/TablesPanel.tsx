import { Box, LoadingOverlay, Text } from '@mantine/core';
import { useTimeout } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import ResizableSplitter from '../../../components/common/ResizableSplitter';
import { useAppSelector } from '../store/hooks';
import handleStyles from './ResizeHandle.module.css';
import { TableFields } from './TableFields';
import { Tables } from './Tables';
import styles from './TablesPanel.module.css';

type TablesPanelProps = {
    isLoading: boolean;
    error: string | null;
    onRefresh: () => void;
};

export const TablesPanel: React.FC<TablesPanelProps> = ({
    isLoading,
    error,
    onRefresh,
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
        <Box pos="relative" flex={1} mih={0}>
            <LoadingOverlay visible={isLoading} />

            {error && (
                <Text c="red" ta="center">
                    {error}
                </Text>
            )}

            {isLoading && showLoadingMessage && (
                <Text ta="center">Hang on, still loading...</Text>
            )}

            {!isLoading && !error && (
                <ResizableSplitter
                    orientation="vertical"
                    lineSize={9}
                    handleColor="transparent"
                    classNames={{ handle: handleStyles.resizeHandle }}
                >
                    <ResizableSplitter.Pane
                        id="sql-runner-tables"
                        defaultSize={initialPanelSizes[0]}
                        className={styles.pane}
                    >
                        <Tables onRefresh={onRefresh} />
                    </ResizableSplitter.Pane>

                    {activeTable && (
                        <ResizableSplitter.Pane
                            id="sql-runner-table-fields"
                            defaultSize={initialPanelSizes[1]}
                            className={styles.pane}
                        >
                            <TableFields />
                        </ResizableSplitter.Pane>
                    )}
                </ResizableSplitter>
            )}
        </Box>
    );
};
