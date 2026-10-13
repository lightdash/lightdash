import { Center, Stack, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';

// A run or a node result that failed: what failed, in the chart area.
export const AiComposerResultError: FC<{
    headerContent: ReactNode;
    message: string | null;
}> = ({ headerContent, message }) => {
    const uiStrings = useUiStrings();
    return (
        <Stack gap="md" h="100%" mih={300}>
            {headerContent}
            <Center flex={1}>
                <Stack gap="xs" align="center" justify="center" maw={420}>
                    <MantineIcon icon={IconAlertCircle} color="red" />
                    <Text size="xs" fw={500} ta="center">
                        {uiStrings('aiAgent.composer.resultError')}
                    </Text>
                    {message && (
                        <Text
                            size="xs"
                            c="dimmed"
                            ta="center"
                            style={{ overflowWrap: 'anywhere' }}
                        >
                            {message}
                        </Text>
                    )}
                </Stack>
            </Center>
        </Stack>
    );
};
