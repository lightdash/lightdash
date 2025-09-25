import { Center, getDefaultZIndex, Text } from '@mantine/core';
import { IconTool } from '@tabler/icons-react';
import MantineIcon from '../common/MantineIcon';
import { BANNER_HEIGHT } from '../common/Page/constants';

export const PreviewBanner = () => (
    <Center
        pos="fixed"
        w="100%"
        h={BANNER_HEIGHT}
        bg="blue.6"
        style={{
            zIndex: getDefaultZIndex('app'),
        }}
    >
        <MantineIcon icon={IconTool} color="white" size="sm" />
        <Text color="white" fw={500} fz="xs" mx="xxs">
            This is a preview environment. Any changes you make here will not
            affect production.
        </Text>
    </Center>
);
