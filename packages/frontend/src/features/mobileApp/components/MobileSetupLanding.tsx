import { Box, Button, Stack, Text, Title } from '@mantine/core';
import { IconDeviceMobile } from '@tabler/icons-react';
import { type FC } from 'react';
import { useSearchParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import useHealth from '../../../hooks/health/useHealth';
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
    const [searchParams] = useSearchParams();
    const { data: health } = useHealth();

    const link = parseMobileSetupLinkParams(searchParams);
    const platform = detectMobilePlatform(
        navigator.userAgent,
        navigator.maxTouchPoints,
    );

    const playStoreUrl = health?.mobileApp.playStoreUrl;
    const appStoreUrl = health?.mobileApp.appStoreUrl ?? null;

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
                <Text c="dimmed">
                    Already installed the app? Open it to finish signing in.
                </Text>
                <Button
                    component="a"
                    href={buildMobileSetupSchemeUrl(link)}
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
