import { Box, LoadingOverlay, Stack, Text } from '@mantine/core';
import { IconGripHorizontal } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import ResizableSplitter from '../../../../components/common/ResizableSplitter';
import resizeHandleStyles from '../../components/ResizeHandle.module.css';
import { useActiveConnection } from '../hooks/useActiveConnection';
import { MultiConnectionTableFields } from './MultiConnectionTableFields';
import { MultiConnectionTables } from './MultiConnectionTables';

export const MultiConnectionTablesPanel: FC<{
    isRefreshing: boolean;
    refreshError: string | null;
}> = ({ isRefreshing, refreshError }) => {
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
                classNames={{ handle: resizeHandleStyles.resizeHandle }}
            >
                <ResizableSplitter.Pane
                    id="sql-runner-connection-tables"
                    defaultSize={50}
                >
                    <Stack gap="xs" h="100%">
                        <MultiConnectionTables />
                    </Stack>
                </ResizableSplitter.Pane>
                {activeTable && (
                    <ResizableSplitter.Pane
                        id="sql-runner-connection-table-fields"
                        defaultSize={50}
                    >
                        <MultiConnectionTableFields />
                    </ResizableSplitter.Pane>
                )}
            </ResizableSplitter>
        </Box>
    );
};
