import { Center, Text } from '@mantine-8/core';
import { IconTool } from '@tabler/icons-react';
import MantineIcon from '../common/MantineIcon';
import { BANNER_HEIGHT } from '../common/Page/constants';
import classes from './PreviewBanner.module.css';

export const PreviewBanner = () => (
    <Center
        id="preview-banner"
        pos="fixed"
        top={0}
        w="100%"
        h={BANNER_HEIGHT}
        bg="blue.6"
        className={classes.banner}
    >
        <MantineIcon icon={IconTool} color="white" size="sm" />
        <Text c="white" fw={500} fz="xs" mx={4}>
            This is a preview environment. Any changes you make here will not
            affect production.
        </Text>
    </Center>
);
