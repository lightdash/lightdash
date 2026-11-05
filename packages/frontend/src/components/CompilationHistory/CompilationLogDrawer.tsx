import { Box, Drawer, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { type ProjectCompileLog } from '../../hooks/useProjectCompileLogs';
import { CopyActionIcon } from '../common/CopyActionIcon';
import JsonTree from '../common/JsonViewer/JsonTree';

type CompilationLogDrawerProps = {
    opened: boolean;
    onClose: () => void;
    log: ProjectCompileLog | null;
};

export const CompilationLogDrawer: FC<CompilationLogDrawerProps> = ({
    opened,
    onClose,
    log,
}) => {
    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            position="right"
            size="lg"
            title={
                <Group justify="space-between" w="100%">
                    <Text fw={600} fz="lg">
                        Compilation Log Details
                    </Text>
                    {log && (
                        <CopyActionIcon
                            value={JSON.stringify(log, null, 2)}
                            copyLabel="Copy JSON"
                        />
                    )}
                </Group>
            }
        >
            <ScrollArea h="calc(100vh - 80px)">
                <Stack gap="md">
                    {log && (
                        <Box>
                            <JsonTree
                                value={log}
                                expandDepth={0}
                                withCopy={false}
                                onSelectPath={null}
                            />
                        </Box>
                    )}
                </Stack>
            </ScrollArea>
        </Drawer>
    );
};
