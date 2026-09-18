import { Box, LoadingOverlay, Text } from '@mantine/core';
import { useTimeout } from '@mantine/hooks';
import { IconGripHorizontal } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import ResizableSplitter from '../../../components/common/ResizableSplitter';
import { isProtoMultiConnectionEnabled, ProtoTables } from '../prototype';
import { useAppSelector } from '../store/hooks';
import styles from './ResizeHandle.module.css';
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
                    withHandle
                    lineSize={6}
                    handleColor="ldGray.1"
                    handleIcon={
                        <MantineIcon
                            color="gray"
                            icon={IconGripHorizontal}
                            size={8}
                        />
                    }
                    classNames={{ handle: styles.resizeHandle }}
                >
                    <ResizableSplitter.Pane
                        id="sql-runner-tables"
                        defaultSize={initialPanelSizes[0]}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        {isProtoMultiConnectionEnabled ? (
                            <ProtoTables />
                        ) : (
                            <Tables />
                        )}
                    </ResizableSplitter.Pane>

                    {activeTable && (
                        <ResizableSplitter.Pane
                            id="sql-runner-table-fields"
                            defaultSize={initialPanelSizes[1]}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                            }}
                        >
                            <TableFields />
                        </ResizableSplitter.Pane>
                    )}
                </ResizableSplitter>
            )}
        </Box>
    );
};
