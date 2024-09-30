import { Center, Text } from '@mantine/core';
import { IconTool } from '@tabler/icons-react';
import { BANNER_HEIGHT } from '.';
import MantineIcon from '../common/MantineIcon';

export const PreviewBanner = () => (
    <Center pos="fixed" w="100%" h={BANNER_HEIGHT} bg="blue.6">
        <MantineIcon icon={IconTool} color="white" size="sm" />
        <Text color="white" fw={500} fz="xs" mx="xxs">
            This is a preview environment. Any changes you make here will not
            affect production.
        </Text>
    </Center>
);
