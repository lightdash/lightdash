import { Button, Center, Group, Text } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
    useImpersonation,
    useStopImpersonation,
} from '../../hooks/user/useImpersonation';
import MantineIcon from '../common/MantineIcon';
import { BANNER_HEIGHT } from '../common/Page/constants';
import classes from './ImpersonationBanner.module.css';

export const ImpersonationBanner = () => {
    const { t } = useTranslation('navigation');
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
                    {t('impersonation.message')}
                </Text>
                <Button
                    size="compact-xs"
                    variant="white"
                    color="orange"
                    onClick={() => stopImpersonating()}
                    loading={isLoading}
                >
                    {t('impersonation.stop')}
                </Button>
            </Group>
        </Center>
    );
};
