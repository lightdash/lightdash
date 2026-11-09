import { type ApiError, type MobileAppLink } from '@lightdash/common';
import {
    Box,
    Button,
    Code,
    CopyButton,
    Group,
    Loader,
    Stack,
    Text,
    Title,
    VisuallyHidden,
} from '@mantine/core';
import {
    IconCheck,
    IconCircleCheck,
    IconCopy,
    IconQrcodeOff,
} from '@tabler/icons-react';
import {
    lazy,
    Suspense,
    useEffect,
    useRef,
    useState,
    type FC,
    type PropsWithChildren,
    type ReactNode,
    type RefObject,
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

type StepState = 'upcoming' | 'current' | 'done';

const getHost = (siteUrl: string | undefined) => {
    if (!siteUrl) return window.location.host;
    try {
        return new URL(siteUrl).host;
    } catch {
        return window.location.host;
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
        state: StepState;
        headingRef: RefObject<HTMLHeadingElement | null>;
        aside?: ReactNode;
    }>
> = ({ step, title, state, headingRef, aside, children }) => (
    <SettingsCard withBorder>
        <Stack gap="md">
            <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap">
                    <span
                        className={classes.stepBadge}
                        data-state={state}
                        aria-hidden
                    >
                        {state === 'done' ? (
                            <MantineIcon icon={IconCheck} size={14} />
                        ) : (
                            step
                        )}
                    </span>
                    <Title
                        order={5}
                        c={state === 'upcoming' ? 'dimmed' : undefined}
                        ref={headingRef}
                        tabIndex={-1}
                        className={classes.stepTitle}
                    >
                        {title}
                    </Title>
                </Group>
                {aside}
            </Group>
            {children}
        </Stack>
    </SettingsCard>
);

const QrCodePanel: FC<{
    link: MobileAppLink | null;
    remainingSeconds: number | null;
    mintError: ApiError | null;
    onRetry: () => void;
    onHasApp: () => void;
}> = ({ link, remainingSeconds, mintError, onRetry, onHasApp }) => (
    <Group align="flex-start" gap="lg">
        <Box className={classes.qrFrame}>
            {mintError ? (
                <MantineIcon icon={IconQrcodeOff} size="xl" color="dimmed" />
            ) : link ? (
                <Suspense fallback={<Loader size="sm" />}>
                    <MobileAppQrCode value={link.scanUrl} />
                </Suspense>
            ) : (
                <Loader size="sm" aria-label={MOBILE_STRINGS.creatingCode} />
            )}
        </Box>
        <Stack gap="md" className={classes.details}>
            {mintError ? (
                <Text size="sm">{MOBILE_STRINGS.couldNotCreateCode}</Text>
            ) : (
                link &&
                remainingSeconds !== null && (
                    <Stack gap={2}>
                        <Text size="sm">{MOBILE_STRINGS.waitingForScan}</Text>
                        <Text size="xs" c="dimmed">
                            {MOBILE_STRINGS.expiresIn(
                                formatCountdown(remainingSeconds),
                            )}
                        </Text>
                    </Stack>
                )
            )}
            <Group gap="xs">
                {mintError ? (
                    <Button size="xs" variant="default" onClick={onRetry}>
                        {MOBILE_STRINGS.tryAgain}
                    </Button>
                ) : (
                    link && (
                        <CopyButton value={link.scanUrl}>
                            {({ copied, copy }) => (
                                <Button
                                    size="xs"
                                    variant="default"
                                    leftSection={
                                        <MantineIcon
                                            icon={copied ? IconCheck : IconCopy}
                                        />
                                    }
                                    onClick={copy}
                                >
                                    {copied
                                        ? MOBILE_STRINGS.copied
                                        : MOBILE_STRINGS.copyLink}
                                </Button>
                            )}
                        </CopyButton>
                    )
                )}
                <Button size="xs" variant="default" onClick={onHasApp}>
                    {MOBILE_STRINGS.alreadyHaveApp}
                </Button>
            </Group>
        </Stack>
    </Group>
);

export const MobileSettingsPage: FC = () => {
    const { data: health } = useHealth();
    const host = getHost(health?.siteUrl);
    const { link, isScanned, remainingSeconds, mintError, retry } =
        useMobileAppLink();
    const [hasApp, setHasApp] = useState(false);
    const isStepOneDone = isScanned || hasApp;

    const stepOneHeading = useRef<HTMLHeadingElement>(null);
    const stepTwoHeading = useRef<HTMLHeadingElement>(null);
    const pendingFocus = useRef<RefObject<HTMLHeadingElement | null> | null>(
        null,
    );
    useEffect(() => {
        pendingFocus.current?.current?.focus();
        pendingFocus.current = null;
    }, [hasApp]);
    const showSignIn = () => {
        pendingFocus.current = stepTwoHeading;
        setHasApp(true);
    };
    const showCode = () => {
        pendingFocus.current = stepOneHeading;
        setHasApp(false);
    };

    return (
        <SettingsPage title={MOBILE_STRINGS.pageTitle}>
            <Stack gap="md">
                <StepCard
                    step={1}
                    title={MOBILE_STRINGS.getAppTitle}
                    state={isStepOneDone ? 'done' : 'current'}
                    headingRef={stepOneHeading}
                    aside={
                        isScanned ? (
                            <Group gap={6} wrap="nowrap">
                                <MantineIcon
                                    icon={IconCircleCheck}
                                    color="green.7"
                                />
                                <Text size="sm" c="dimmed">
                                    {MOBILE_STRINGS.openedOnPhone}
                                </Text>
                            </Group>
                        ) : (
                            hasApp && (
                                <Button
                                    size="xs"
                                    variant="subtle"
                                    onClick={showCode}
                                >
                                    {MOBILE_STRINGS.showCode}
                                </Button>
                            )
                        )
                    }
                >
                    {!isStepOneDone && (
                        <QrCodePanel
                            link={link}
                            remainingSeconds={remainingSeconds}
                            mintError={mintError}
                            onRetry={retry}
                            onHasApp={showSignIn}
                        />
                    )}
                </StepCard>

                <StepCard
                    step={2}
                    title={MOBILE_STRINGS.signInTitle}
                    state={isStepOneDone ? 'current' : 'upcoming'}
                    headingRef={stepTwoHeading}
                >
                    {isStepOneDone && (
                        <Group gap="xs" wrap="nowrap">
                            <Text size="sm">{MOBILE_STRINGS.signInTo}</Text>
                            <Code fz="sm" className={classes.host}>
                                {host}
                            </Code>
                            <CopyActionIcon
                                value={host}
                                copyLabel={MOBILE_STRINGS.copyHost}
                                copiedLabel={MOBILE_STRINGS.copied}
                                variant="subtle"
                                size="sm"
                            />
                        </Group>
                    )}
                </StepCard>

                <VisuallyHidden role="status" aria-live="polite">
                    {isScanned ? MOBILE_STRINGS.openedOnPhone : ''}
                </VisuallyHidden>
            </Stack>
        </SettingsPage>
    );
};
