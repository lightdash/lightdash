import {
    Box,
    Button,
    Code,
    Group,
    Loader,
    Stack,
    Text,
    Title,
    VisuallyHidden,
} from '@mantine/core';
import { IconCircleCheck } from '@tabler/icons-react';
import {
    lazy,
    Suspense,
    useState,
    type FC,
    type PropsWithChildren,
    type ReactNode,
} from 'react';
import { CopyActionIcon } from '../../components/common/CopyActionIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { SettingsPage } from '../../components/common/Settings/SettingsPage';
import useHealth from '../../hooks/health/useHealth';
import classes from './MobileSettingsPage.module.css';
import { useMobileAppLink } from './useMobileAppLink';

const MobileAppQrCode = lazy(() => import('./MobileAppQrCode'));

const getHost = (siteUrl: string | undefined) => {
    if (!siteUrl) return null;
    try {
        return new URL(siteUrl).host;
    } catch {
        return null;
    }
};

const formatCountdown = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
};

const StepCard: FC<
    PropsWithChildren<{
        step: number;
        title: string;
        isActive: boolean;
        aside?: ReactNode;
    }>
> = ({ step, title, isActive, aside, children }) => (
    <SettingsCard withBorder data-active={isActive} className={classes.step}>
        <Stack gap="sm">
            <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap">
                    <span className={classes.stepNumber} aria-hidden>
                        {step}
                    </span>
                    <Title order={5}>{title}</Title>
                </Group>
                {aside}
            </Group>
            {children}
        </Stack>
    </SettingsCard>
);

export const MobileSettingsPage: FC = () => {
    const { data: health } = useHealth();
    const host = getHost(health?.siteUrl);
    const { link, isScanned, remainingSeconds, isMinting, mintError, retry } =
        useMobileAppLink();
    const [hasApp, setHasApp] = useState(false);
    const isSignInOpen = isScanned || hasApp;

    return (
        <SettingsPage
            title="Mobile"
            description="Use Lightdash on your phone. Scan the codes with your phone's camera."
        >
            <Stack gap="md">
                <StepCard
                    step={1}
                    title="Get the app"
                    isActive={!isSignInOpen}
                    aside={
                        isScanned ? (
                            <Group gap={4} c="green.7" wrap="nowrap">
                                <MantineIcon icon={IconCircleCheck} />
                                <Text size="sm" fw={500}>
                                    Link opened on a phone
                                </Text>
                            </Group>
                        ) : null
                    }
                >
                    {!isScanned && (
                        <Group align="flex-start" gap="lg" wrap="nowrap">
                            <Box className={classes.qrFrame}>
                                {link ? (
                                    <Suspense fallback={<Loader size="sm" />}>
                                        <MobileAppQrCode value={link.scanUrl} />
                                    </Suspense>
                                ) : (
                                    <Loader
                                        size="sm"
                                        aria-label="Creating the code"
                                    />
                                )}
                            </Box>
                            <Stack gap="sm" className={classes.details}>
                                <Text size="sm">
                                    Scan this with your phone's camera. It opens
                                    the App Store on an iPhone or Google Play on
                                    Android.
                                </Text>
                                {link && (
                                    <Group
                                        gap="xs"
                                        wrap="nowrap"
                                        className={classes.linkRow}
                                    >
                                        <Code className={classes.link}>
                                            {link.scanUrl}
                                        </Code>
                                        <CopyActionIcon
                                            value={link.scanUrl}
                                            copyLabel="Copy link"
                                            variant="default"
                                        />
                                    </Group>
                                )}
                                {mintError ? (
                                    <Group gap="sm">
                                        <Text size="sm" c="red.7">
                                            {mintError.error.message}
                                        </Text>
                                        <Button
                                            size="xs"
                                            variant="default"
                                            onClick={retry}
                                        >
                                            Try again
                                        </Button>
                                    </Group>
                                ) : (
                                    link &&
                                    remainingSeconds !== null && (
                                        <Text size="sm" c="dimmed">
                                            Waiting for scan · Expires in{' '}
                                            {formatCountdown(remainingSeconds)}
                                        </Text>
                                    )
                                )}
                                {!isMinting && !hasApp && (
                                    <Group>
                                        <Button
                                            size="xs"
                                            variant="default"
                                            onClick={() => setHasApp(true)}
                                        >
                                            I already have the app
                                        </Button>
                                    </Group>
                                )}
                            </Stack>
                        </Group>
                    )}
                </StepCard>

                <StepCard
                    step={2}
                    title="Sign in on your phone"
                    isActive={isSignInOpen}
                >
                    <Text size="sm" c={isSignInOpen ? undefined : 'dimmed'}>
                        {isSignInOpen ? (
                            <>
                                Open the app and sign in to{' '}
                                <Text span fw={600} inherit>
                                    {host ?? 'this instance'}
                                </Text>
                                .
                            </>
                        ) : (
                            <>
                                This step opens after you scan the code, or when
                                you click <b>I already have the app</b>.
                            </>
                        )}
                    </Text>
                </StepCard>

                <VisuallyHidden role="status" aria-live="polite">
                    {isScanned ? 'Link opened on a phone' : ''}
                </VisuallyHidden>
            </Stack>
        </SettingsPage>
    );
};
