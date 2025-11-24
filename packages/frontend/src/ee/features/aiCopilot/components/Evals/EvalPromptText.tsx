import { Box, Card, Group, Stack, Title } from '@mantine-8/core';
import { IconTextPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';

type Props = {
    prompt: string;
};

export const EvalPromptText: FC<Props> = ({ prompt }) => {
    return (
        <Card p="sm" withBorder>
            <Stack gap="xs">
                <Group gap="xs" align="flex-start">
                    <MantineIcon icon={IconTextPlus} color="ldGray.6" />
                    <Box style={{ flex: 1 }}>
                        <Title order={6} lineClamp={2} lh={1.2}>
                            {prompt}
                        </Title>
                    </Box>
                </Group>
            </Stack>
        </Card>
    );
};
