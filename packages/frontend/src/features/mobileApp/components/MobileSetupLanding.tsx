import { Box, Button, Paper, Stack, Text, Title } from '@mantine/core';
import { IconDeviceMobile } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useSearchParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import useHealth from '../../../hooks/health/useHealth';
import { useMobileSetupAutoOpen } from '../hooks/useMobileSetupAutoOpen';
import { detectMobilePlatform } from '../utils/platform';
import {
    buildMobileSetupSchemeUrl,
    parseMobileSetupLinkParams,
} from '../utils/setupLink';
import { AppStoreBadges } from './AppStoreBadges';
import classes from './MobileSetupLanding.module.css';

const SCAN_AGAIN_HINT =
    'Open Settings → Mobile app in Lightdash on your computer and scan the code again.';

export const MobileSetupLanding: FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { data: health } = useHealth();

    // Read the code once, then take it out of the URL. A code left in
    // window.location reaches Sentry breadcrumbs, browser history, the Referer
    // header of every outbound request and any analytics that records a path.
    const [link] = useState(() => parseMobileSetupLinkParams(searchParams));

    useEffect(() => {
        if (searchParams.toString() === '') return;
        setSearchParams(new URLSearchParams(), { replace: true });
    }, [searchParams, setSearchParams]);

    const platform = detectMobilePlatform(
        navigator.userAgent,
        navigator.maxTouchPoints,
    );

    const playStoreUrl = health?.mobileApp.playStoreUrl;
    const appStoreUrl = health?.mobileApp.appStoreUrl ?? null;

    const schemeUrl =
        link.status === 'valid' ? buildMobileSetupSchemeUrl(link) : null;
    const storeUrl = (platform === 'ios' ? appStoreUrl : playStoreUrl) ?? null;

    useMobileSetupAutoOpen({
        schemeUrl,
        storeUrl,
        enabled: platform !== 'desktop' && link.status === 'valid',
    });

    const badges = playStoreUrl ? (
        <AppStoreBadges playStoreUrl={playStoreUrl} appStoreUrl={appStoreUrl} />
    ) : null;

    if (link.status === 'unsupported-version') {
        return (
            <Box className={classes.page}>
                <Stack gap="md" className={classes.content}>
                    <Title order={3}>Update the Lightdash app</Title>
                    <Text c="dimmed">
                        This setup code needs a newer version of the Lightdash
                        app. Update the app, then scan the code again.
                    </Text>
                    {badges}
                </Stack>
            </Box>
        );
    }

    if (link.status === 'invalid') {
        return (
            <Box className={classes.page}>
                <Stack gap="md" className={classes.content}>
                    <Title order={3}>This setup link is not valid</Title>
                    <Text c="dimmed">{SCAN_AGAIN_HINT}</Text>
                </Stack>
            </Box>
        );
    }

    if (platform === 'desktop') {
        return (
            <Box className={classes.page}>
                <Stack gap="md" className={classes.content}>
                    <Title order={3}>Open this on your phone</Title>
                    <Text c="dimmed">
                        Point your phone's camera at the QR code in Lightdash to
                        sign in to the mobile app.
                    </Text>
                    {badges}
                </Stack>
            </Box>
        );
    }

    return (
        <Box className={classes.page}>
            <Stack gap="md" className={classes.content}>
                <Title order={3}>Sign in to the Lightdash app</Title>
                <Paper withBorder p="sm" className={classes.origin}>
                    <Text fz="xs" c="dimmed">
                        Signing in to
                    </Text>
                    <Text fw={600} className={classes.originValue}>
                        {link.instanceOrigin}
                    </Text>
                </Paper>
                <Text c="dimmed">
                    Opening the app. If nothing happens, use the buttons below.
                </Text>
                <Button
                    component="a"
                    href={schemeUrl ?? undefined}
                    size="md"
                    leftSection={<MantineIcon icon={IconDeviceMobile} />}
                >
                    Open in Lightdash
                </Button>
                <Stack gap="xs">
                    <Text fz="sm" c="dimmed">
                        Don't have the app yet?
                    </Text>
                    {badges}
                </Stack>
                <Text fz="xs" c="dimmed">
                    This code works once and expires after five minutes.{' '}
                    {SCAN_AGAIN_HINT}
                </Text>
            </Stack>
        </Box>
    );
};
