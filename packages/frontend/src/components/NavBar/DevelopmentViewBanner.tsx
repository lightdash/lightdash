import { Button, Center, Group, Text } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import { useDevelopmentView } from '../../features/semanticStudio/developmentView';
import MantineIcon from '../common/MantineIcon';
import { BANNER_HEIGHT } from '../common/Page/constants';
import classes from './ImpersonationBanner.module.css';

/** Shown on every page while queries read the person's unpublished models, so a number is never mistaken for a live one. */
export const DevelopmentViewBanner = () => {
    const [, setIsOn] = useDevelopmentView();
    return (
        <Center
            pos="fixed"
            top={0}
            w="100%"
            h={BANNER_HEIGHT}
            bg="orange.6"
            className={classes.banner}
        >
            <Group gap="sm">
                <MantineIcon icon={IconEye} color="white" size="sm" />
                <Text c="white" fw={500} fz="xs">
                    You are trying your changes in development. Only you see
                    them, and saving is off until you go back to live.
                </Text>
                <Button
                    size="compact-xs"
                    variant="white"
                    color="orange"
                    onClick={() => setIsOn(false)}
                >
                    Back to live
                </Button>
            </Group>
        </Center>
    );
};
