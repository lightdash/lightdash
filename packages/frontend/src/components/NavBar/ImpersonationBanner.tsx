import { Button, Center, Group, Text } from '@mantine-8/core';
import { IconEye } from '@tabler/icons-react';
import {
    useImpersonation,
    useStopImpersonation,
} from '../../hooks/user/useImpersonation';
import MantineIcon from '../common/MantineIcon';
import { BANNER_HEIGHT } from '../common/Page/constants';
import classes from './ImpersonationBanner.module.css';

export const ImpersonationBanner = () => {
    const { impersonation } = useImpersonation();
    const { mutate: stopImpersonating, isLoading } = useStopImpersonation();

    if (!impersonation) return null;

    return (
        <Center
            id="impersonation-banner"
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
                    You are impersonating another user
                </Text>
                <Button
                    size="compact-xs"
                    variant="white"
                    color="orange"
                    onClick={() => stopImpersonating()}
                    loading={isLoading}
                >
                    Stop impersonating
                </Button>
            </Group>
        </Center>
    );
};
