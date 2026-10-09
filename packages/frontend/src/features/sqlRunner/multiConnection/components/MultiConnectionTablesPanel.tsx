import { Box, LoadingOverlay, Text } from '@mantine/core';
import { type FC } from 'react';
import ResizableSplitter from '../../../../components/common/ResizableSplitter';
import handleStyles from '../../components/ResizeHandle.module.css';
import styles from '../../components/TablesPanel.module.css';
import { useActiveConnection } from '../hooks/useActiveConnection';
import { MultiConnectionTableFields } from './MultiConnectionTableFields';
import { MultiConnectionTables } from './MultiConnectionTables';

export const MultiConnectionTablesPanel: FC<{
    isRefreshing: boolean;
    refreshError: string | null;
    onRefresh: () => void;
    isRefreshDisabled: boolean;
}> = ({ isRefreshing, refreshError, onRefresh, isRefreshDisabled }) => {
    const { activeTable } = useActiveConnection();

    return (
        <Box pos="relative" flex={1} mih={0}>
            <LoadingOverlay visible={isRefreshing} />
            {refreshError && (
                <Text c="red" ta="center">
                    {refreshError}
                </Text>
            )}
            <ResizableSplitter
                orientation="vertical"
                lineSize={9}
                handleColor="transparent"
                classNames={{ handle: handleStyles.resizeHandle }}
            >
                <ResizableSplitter.Pane
                    id="sql-runner-connection-tables"
                    defaultSize={50}
                    className={styles.pane}
                >
                    <MultiConnectionTables
                        onRefresh={onRefresh}
                        isRefreshDisabled={isRefreshDisabled}
                    />
                </ResizableSplitter.Pane>
                {activeTable && (
                    <ResizableSplitter.Pane
                        id="sql-runner-connection-table-fields"
                        defaultSize={50}
                        className={styles.pane}
                    >
                        <MultiConnectionTableFields />
                    </ResizableSplitter.Pane>
                )}
            </ResizableSplitter>
        </Box>
    );
};
