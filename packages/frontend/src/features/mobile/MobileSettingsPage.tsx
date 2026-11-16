import { FeatureFlags, type MobileAppLink } from '@lightdash/common';
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
    IconDeviceMobile,
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
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { CloudMobileSignInView } from './CloudMobileSignInView';
import { getHost } from './mobileFormat';
import classes from './MobileSettingsPage.module.css';
import { MobileSignInStep } from './MobileSignInStep';
import { MOBILE_STRINGS } from './mobileStrings';
import { StoreBadges } from './StoreBadges';
import { useCloudMobileSetup } from './useCloudMobileSetup';
import { useMobileAppLink } from './useMobileAppLink';
import {
    useMobileSignInCode,
    type MobileSignInPhase,
} from './useMobileSignInCode';

const MobileAppQrCode = lazy(() => import('./MobileAppQrCode'));

type StepState = 'upcoming' | 'current' | 'done';

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
    hasFailed: boolean;
    onRetry: () => void;
    onHasApp: (() => void) | null;
}> = ({ link, hasFailed, onRetry, onHasApp }) => (
    <Group align="flex-start" gap="lg">
        <Box className={classes.qrFrame}>
            {hasFailed ? (
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
            {hasFailed ? (
                <Text size="sm">{MOBILE_STRINGS.couldNotCreateCode}</Text>
            ) : (
                link && (
                    <VisuallyHidden aria-live="polite">
                        {MOBILE_STRINGS.waitingForScan}
                    </VisuallyHidden>
                )
            )}
            <Group gap="xs">
                {hasFailed ? (
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
                {onHasApp && (
                    <Button size="xs" variant="default" onClick={onHasApp}>
                        {MOBILE_STRINGS.alreadyHaveApp}
                    </Button>
                )}
            </Group>
        </Stack>
    </Group>
);

const OpenedOnPhone: FC = () => (
    <Group gap={6} wrap="nowrap">
        <MantineIcon icon={IconCircleCheck} color="green.7" />
        <Text size="sm" c="dimmed">
            {MOBILE_STRINGS.openedOnPhone}
        </Text>
    </Group>
);

const SignInHost: FC<{ host: string }> = ({ host }) => (
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
);

type ViewProps = {
    host: string;
    appLink: ReturnType<typeof useMobileAppLink>;
};

type SignInStepsViewProps = ViewProps & {
    hasApp: boolean;
    setHasApp: (hasApp: boolean) => void;
};

// The scan removes the focused control, so move focus on instead of to body.
const useFocusAfterScan = (
    isScanned: boolean,
    target: RefObject<HTMLElement | null>,
) => {
    useEffect(() => {
        const active = document.activeElement;
        if (isScanned && (active === null || active === document.body)) {
            target.current?.focus();
        }
    }, [isScanned, target]);
};

const GetAppView: FC<ViewProps> = ({ host, appLink }) => {
    const heading = useRef<HTMLHeadingElement>(null);
    useFocusAfterScan(appLink.isScanned, heading);

    return (
        <SettingsCard withBorder>
            <Stack gap="md">
                <Group justify="space-between" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon icon={IconDeviceMobile} />
                        <Title
                            order={5}
                            ref={heading}
                            tabIndex={-1}
                            className={classes.stepTitle}
                        >
                            {MOBILE_STRINGS.getAppTitle}
                        </Title>
                    </Group>
                    {appLink.isScanned && <OpenedOnPhone />}
                </Group>
                {!appLink.isScanned && (
                    <QrCodePanel
                        link={appLink.link}
                        hasFailed={appLink.hasFailed}
                        onRetry={appLink.retry}
                        onHasApp={null}
                    />
                )}
                <StoreBadges />
                <SignInHost host={host} />
            </Stack>
        </SettingsCard>
    );
};

const getStepTwoState = (
    isStepOneDone: boolean,
    phase: MobileSignInPhase,
): StepState => {
    if (phase === 'redeemed') return 'done';
    return isStepOneDone ? 'current' : 'upcoming';
};

const SignInStepsView: FC<SignInStepsViewProps> = ({
    host,
    appLink,
    hasApp,
    setHasApp,
}) => {
    const { link, isScanned, hasFailed, retry } = appLink;
    const isStepOneDone = isScanned || hasApp;
    const signIn = useMobileSignInCode({ autoShow: isStepOneDone });

    const stepOneHeading = useRef<HTMLHeadingElement>(null);
    const stepTwoHeading = useRef<HTMLHeadingElement>(null);
    const pendingFocus = useRef<RefObject<HTMLHeadingElement | null> | null>(
        null,
    );
    useEffect(() => {
        pendingFocus.current?.current?.focus();
        pendingFocus.current = null;
    }, [hasApp]);
    useFocusAfterScan(isScanned, stepTwoHeading);
    const showSignIn = () => {
        pendingFocus.current = stepTwoHeading;
        setHasApp(true);
    };
    const showCode = () => {
        signIn.hide();
        pendingFocus.current = stepOneHeading;
        setHasApp(false);
    };

    return (
        <Stack gap="md">
            <StepCard
                step={1}
                title={MOBILE_STRINGS.getAppTitle}
                state={isStepOneDone ? 'done' : 'current'}
                headingRef={stepOneHeading}
                aside={
                    isScanned ? (
                        <OpenedOnPhone />
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
                    <>
                        <QrCodePanel
                            link={link}
                            hasFailed={hasFailed}
                            onRetry={retry}
                            onHasApp={showSignIn}
                        />
                        <StoreBadges />
                    </>
                )}
            </StepCard>

            <StepCard
                step={2}
                title={MOBILE_STRINGS.signInTitle}
                state={getStepTwoState(isStepOneDone, signIn.phase)}
                headingRef={stepTwoHeading}
            >
                {isStepOneDone && <SignInHost host={host} />}
                {isStepOneDone && <MobileSignInStep signIn={signIn} />}
            </StepCard>
        </Stack>
    );
};

export const MobileSettingsPage: FC = () => {
    const { data: health } = useHealth();
    const host = getHost(health?.siteUrl);
    const [hasApp, setHasApp] = useState(false);
    const isCloudMobileSetup = useCloudMobileSetup();
    const appLink = useMobileAppLink({
        isPaused: hasApp,
        enabled: isCloudMobileSetup === false,
    });
    const { data: qrSignInFlag } = useServerFeatureFlag(
        FeatureFlags.MobileQrSignIn,
    );

    if (isCloudMobileSetup === null) return null;

    return (
        <SettingsPage title={MOBILE_STRINGS.pageTitle}>
            {isCloudMobileSetup ? (
                <CloudMobileSignInView host={host} />
            ) : qrSignInFlag?.enabled ? (
                <SignInStepsView
                    host={host}
                    appLink={appLink}
                    hasApp={hasApp}
                    setHasApp={setHasApp}
                />
            ) : (
                <GetAppView host={host} appLink={appLink} />
            )}
            <VisuallyHidden role="status" aria-live="polite">
                {appLink.isScanned ? MOBILE_STRINGS.openedOnPhone : ''}
            </VisuallyHidden>
        </SettingsPage>
    );
};
