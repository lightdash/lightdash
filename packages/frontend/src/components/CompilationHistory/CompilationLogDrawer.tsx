import {
    ActionIcon,
    Box,
    CopyButton,
    Drawer,
    Group,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
import ReactJson from 'react-json-view';
import { type ProjectCompileLog } from '../../hooks/useProjectCompileLogs';
import { useRjvTheme } from '../../hooks/useRjvTheme';
import MantineIcon from '../common/MantineIcon';

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
                        <CopyButton
                            value={JSON.stringify(log, null, 2)}
                            timeout={2000}
                        >
                            {({ copied, copy }) => (
                                <Tooltip
                                    label={copied ? 'Copied' : 'Copy JSON'}
                                    withinPortal
                                    variant="xs"
                                >
                                    <ActionIcon
                                        color={copied ? 'teal' : 'gray'}
                                        onClick={copy}
                                        variant="subtle"
                                    >
                                        <MantineIcon
                                            icon={copied ? IconCheck : IconCopy}
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </CopyButton>
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
