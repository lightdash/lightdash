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
import { MOBILE_STRINGS } from './mobileStrings';
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
                    <Title order={5} c={isActive ? undefined : 'dimmed'}>
                        {title}
                    </Title>
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
        <SettingsPage title={MOBILE_STRINGS.pageTitle}>
            <Stack gap="md">
                <StepCard
                    step={1}
                    title={MOBILE_STRINGS.getAppTitle}
                    isActive={!isSignInOpen}
                    aside={
                        isScanned ? (
                            <Group gap={4} c="green.7" wrap="nowrap">
                                <MantineIcon icon={IconCircleCheck} />
                                <Text size="sm" fw={500}>
                                    {MOBILE_STRINGS.openedOnPhone}
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
                                        aria-label={MOBILE_STRINGS.creatingCode}
                                    />
                                )}
                            </Box>
                            <Stack gap="sm" className={classes.details}>
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
                                            copyLabel={MOBILE_STRINGS.copyLink}
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
                                            {MOBILE_STRINGS.tryAgain}
                                        </Button>
                                    </Group>
                                ) : (
                                    link &&
                                    remainingSeconds !== null && (
                                        <Stack gap={2}>
                                            <Text size="sm">
                                                {MOBILE_STRINGS.waitingForScan}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {MOBILE_STRINGS.expiresIn(
                                                    formatCountdown(
                                                        remainingSeconds,
                                                    ),
                                                )}
                                            </Text>
                                        </Stack>
                                    )
                                )}
                                {!isMinting && !hasApp && (
                                    <Group>
                                        <Button
                                            size="xs"
                                            variant="default"
                                            onClick={() => setHasApp(true)}
                                        >
                                            {MOBILE_STRINGS.alreadyHaveApp}
                                        </Button>
                                    </Group>
                                )}
                            </Stack>
                        </Group>
                    )}
                </StepCard>

                <StepCard
                    step={2}
                    title={MOBILE_STRINGS.signInTitle}
                    isActive={isSignInOpen}
                >
                    {isSignInOpen && (
                        <Text size="sm">
                            {MOBILE_STRINGS.signInTo(
                                host ?? MOBILE_STRINGS.thisInstance,
                            )}
                        </Text>
                    )}
                </StepCard>

                <VisuallyHidden role="status" aria-live="polite">
                    {isScanned ? MOBILE_STRINGS.openedOnPhone : ''}
                </VisuallyHidden>
            </Stack>
        </SettingsPage>
    );
};
