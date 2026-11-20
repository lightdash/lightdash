import {
    LightdashMode,
    MOBILE_APP_STORE_URL,
    MOBILE_GOOGLE_PLAY_URL,
} from '@lightdash/common';
import { Center, Paper, Stack, Text, Title } from '@mantine/core';
import { useEffect, type FC } from 'react';
import useHealth from '../../hooks/health/useHealth';
import {
    MOBILE_SIGN_IN_LANDING_STRINGS,
    MOBILE_STRINGS,
} from './mobileStrings';
import { StoreBadges } from './StoreBadges';

const MobileSignInLandingPage: FC = () => {
    const { data: health } = useHealth();

    useEffect(() => {
        if (health?.mode !== LightdashMode.CLOUD_BETA) return;

        const userAgent = navigator.userAgent;
        if (/iPhone|iPad|iPod/i.test(userAgent)) {
            window.location.replace(MOBILE_APP_STORE_URL);
        } else if (/Android/i.test(userAgent)) {
            window.location.replace(MOBILE_GOOGLE_PLAY_URL);
        }
    }, [health?.mode]);

    return (
        <Center mih="100vh" p="md">
            <Paper withBorder radius="md" p="xl" maw={480} w="100%">
                <Stack align="center" gap="md">
                    <Title order={3} ta="center">
                        {MOBILE_STRINGS.landingTitle}
                    </Title>
                    <Text c="dimmed" ta="center">
                        {health?.mode === LightdashMode.CLOUD_BETA
                            ? MOBILE_SIGN_IN_LANDING_STRINGS.cloudBody
                            : MOBILE_SIGN_IN_LANDING_STRINGS.body}
                    </Text>
                    <StoreBadges justify="center" />
                </Stack>
            </Paper>
        </Center>
    );
};

export default MobileSignInLandingPage;
