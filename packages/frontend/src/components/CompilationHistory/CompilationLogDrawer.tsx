import { Box, Drawer, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('projectConnection');
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
                        {t('compilationHistory.logDetails')}
                    </Text>
                    {log && (
                        <CopyActionIcon
                            value={JSON.stringify(log, null, 2)}
                            copyLabel={t('compilationHistory.copyJson')}
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
