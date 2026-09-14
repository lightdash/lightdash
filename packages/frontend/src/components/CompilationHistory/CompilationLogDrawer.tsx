import { Box, Drawer, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import ReactJson from 'react-json-view';
import { type ProjectCompileLog } from '../../hooks/useProjectCompileLogs';
import { useRjvTheme } from '../../hooks/useRjvTheme';
import { CopyActionIcon } from '../common/CopyActionIcon';

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
    const theme = useRjvTheme();
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
                            <ReactJson
                                theme={theme}
                                src={log as Record<string, unknown>}
                                enableClipboard={false}
                                displayDataTypes={false}
                                collapsed={1}
                                name={null}
                            />
                        </Box>
                    )}
                </Stack>
            </ScrollArea>
        </Drawer>
    );
};
