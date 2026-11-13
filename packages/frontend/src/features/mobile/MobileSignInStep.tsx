import {
    MobileSignInRefusal,
    type MobileSignInCodeState,
    type MobileSignInDeclinedBy,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Loader,
    Stack,
    Text,
    VisuallyHidden,
} from '@mantine/core';
import { IconCircleCheck, IconQrcodeOff } from '@tabler/icons-react';
import {
    lazy,
    Suspense,
    useEffect,
    useId,
    useRef,
    type FC,
    type ReactNode,
} from 'react';
import Callout from '../../components/common/Callout';
import MantineIcon from '../../components/common/MantineIcon';
import { maskEmail } from './mobileFormat';
import classes from './MobileSettingsPage.module.css';
import { MOBILE_SIGN_IN_STRINGS as S, MOBILE_STRINGS } from './mobileStrings';
import { type useMobileSignInCode } from './useMobileSignInCode';

const MobileAppQrCode = lazy(() => import('./MobileAppQrCode'));

type SignIn = ReturnType<typeof useMobileSignInCode>;

type StepContext = {
    signIn: SignIn;
    site: string;
    account: string;
    platform: string | null;
};

const getPlatformLabel = (state: MobileSignInCodeState | null) => {
    const platform = state?.device?.platform;
    return platform === 'ios' || platform === 'android'
        ? S.platforms[platform]
        : null;
};

const spellNumber = (value: string) => value.split('').join(' ');

const MatchNumber: FC<{ value: string }> = ({ value }) => (
    <Group gap="xs" justify="center">
        {value.split('').map((digit, position) => (
            <Text
                key={position}
                component="span"
                className={classes.digit}
                aria-hidden
            >
                {digit}
            </Text>
        ))}
        <VisuallyHidden>{spellNumber(value)}</VisuallyHidden>
    </Group>
);

const HiddenCode: FC<StepContext> = ({ signIn }) =>
    signIn.isMinting ? null : (
        <Group>
            <Button size="xs" onClick={signIn.show}>
                {S.showCode}
            </Button>
        </Group>
    );

const RefusedNotice: FC<StepContext> = ({ signIn }) => {
    if (signIn.refusal === MobileSignInRefusal.MANAGED_SIGN_IN_REQUIRED) {
        return (
            <Callout variant="info" title={S.managed.title}>
                {S.managed.body}
            </Callout>
        );
    }
    return signIn.refusal ? (
        <Callout variant="neutral" title={S.refusals[signIn.refusal]} />
    ) : null;
};

const FailedMint: FC<StepContext> = ({ signIn }) => (
    <Stack gap="sm" align="flex-start">
        <Callout
            variant="danger"
            title={MOBILE_STRINGS.couldNotCreateCode}
            w="100%"
        />
        <Button size="xs" variant="default" onClick={signIn.show}>
            {MOBILE_STRINGS.tryAgain}
        </Button>
    </Stack>
);

const ShownCode: FC<StepContext> = () => null;

const ConfirmSignIn: FC<StepContext> = ({
    signIn,
    site,
    account,
    platform,
}) => {
    const titleId = useId();
    const decline = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        decline.current?.focus();
    }, []);
    return (
        <Stack gap="sm" role="group" aria-labelledby={titleId}>
            <Stack gap={4}>
                <Text id={titleId} size="sm" fw={600}>
                    {S.confirm.title}
                </Text>
                <Text size="sm" c="dimmed">
                    {S.confirm.description}
                </Text>
            </Stack>
            <Box component="dl" className={classes.confirmRows}>
                {[
                    [S.confirm.account, account],
                    [S.confirm.site, site],
                    ...(platform ? [[S.confirm.device, platform]] : []),
                ].map(([label, value]) => (
                    <Box key={label} className={classes.confirmRow}>
                        <Text component="dt" size="sm" c="dimmed">
                            {label}
                        </Text>
                        <Text component="dd" size="sm">
                            {value}
                        </Text>
                    </Box>
                ))}
            </Box>
            <Group gap="xs">
                <Button
                    ref={decline}
                    size="xs"
                    variant="default"
                    onClick={signIn.decline}
                    disabled={signIn.isDeciding}
                >
                    {S.confirm.decline}
                </Button>
                <Button
                    size="xs"
                    onClick={signIn.approve}
                    loading={signIn.isDeciding}
                >
                    {S.confirm.approve}
                </Button>
            </Group>
        </Stack>
    );
};

const ApprovedNumber: FC<StepContext> = ({ signIn }) =>
    signIn.state?.matchNumber ? (
        <Stack gap="sm" align="flex-start">
            <Text size="sm" fw={600}>
                {S.typeOnPhone}
            </Text>
            <MatchNumber value={signIn.state.matchNumber} />
            <Button
                size="xs"
                variant="default"
                onClick={signIn.decline}
                loading={signIn.isDeciding}
            >
                {S.cancel}
            </Button>
        </Stack>
    ) : null;

const ExpiredCode: FC<StepContext> = ({ signIn }) => (
    <Stack gap="sm" align="flex-start">
        <Callout variant="warning" title={S.expired} w="100%" />
        <Button size="xs" onClick={signIn.show}>
            {S.newCode}
        </Button>
    </Stack>
);

const DECLINED_TITLES: Record<MobileSignInDeclinedBy, string> = {
    web: S.declined,
    phone: S.cancelledOnPhone,
    failed_redeems: S.tooManyWrongNumbers,
};

const DeclinedCode: FC<StepContext> = ({ signIn }) => (
    <Stack gap="sm" align="flex-start">
        <Callout
            variant="neutral"
            title={
                signIn.state?.declinedBy
                    ? DECLINED_TITLES[signIn.state.declinedBy]
                    : S.declined
            }
            w="100%"
        />
        <Button size="xs" variant="default" onClick={signIn.show}>
            {S.newCode}
        </Button>
    </Stack>
);

const SignedIn: FC<StepContext> = ({ signIn, account, platform }) => (
    <Stack gap="sm" align="flex-start">
        <Callout
            variant="neutral"
            icon={<MantineIcon icon={IconCircleCheck} color="green.7" />}
            title={S.signedIn}
            w="100%"
        >
            {platform ? S.signedInAs(platform, account) : account}
        </Callout>
        <Button size="xs" variant="default" onClick={signIn.show}>
            {S.anotherPhone}
        </Button>
    </Stack>
);

const PHASE_VIEWS: Record<SignIn['phase'], FC<StepContext>> = {
    hidden: HiddenCode,
    refused: RefusedNotice,
    failed: FailedMint,
    showing: ShownCode,
    claimed: ConfirmSignIn,
    approved: ApprovedNumber,
    expired: ExpiredCode,
    declined: DeclinedCode,
    redeemed: SignedIn,
};

const getAnnouncement = (signIn: SignIn): string => {
    if (signIn.phase === 'showing') {
        return signIn.isRefreshed ? S.refreshed : MOBILE_STRINGS.waitingForScan;
    }
    if (signIn.phase === 'claimed') return S.confirm.title;
    if (signIn.phase === 'approved' && signIn.state?.matchNumber) {
        return `${S.typeOnPhone}: ${spellNumber(signIn.state.matchNumber)}`;
    }
    return '';
};

const USED_CODE_PHASES: SignIn['phase'][] = ['claimed', 'approved'];

export const MobileSignInQr: FC<{
    signIn: SignIn;
    keepUsed?: boolean;
    placeholder?: ReactNode;
}> = ({ signIn, keepUsed = false, placeholder }) => {
    if (signIn.phase === 'hidden' && signIn.isMinting) {
        return (
            <Box className={classes.qrFrame}>
                <Loader size="sm" aria-label={MOBILE_STRINGS.creatingCode} />
            </Box>
        );
    }
    const isUsed = USED_CODE_PHASES.includes(signIn.phase);
    const isShown = signIn.phase === 'showing' || (keepUsed && isUsed);
    if (isShown && !signIn.code && placeholder) {
        return (
            <Box className={classes.qrFrame} data-used={isUsed}>
                {placeholder}
            </Box>
        );
    }
    if (signIn.code && isShown) {
        return (
            <Box className={classes.qrFrame} data-used={isUsed}>
                <Suspense fallback={<Loader size="sm" />}>
                    <MobileAppQrCode
                        value={signIn.code.signInUrl}
                        label={S.qrLabel}
                    />
                </Suspense>
            </Box>
        );
    }
    return keepUsed ? (
        <Box className={classes.qrFrame} data-used>
            <MantineIcon icon={IconQrcodeOff} size="xl" color="dimmed" />
        </Box>
    ) : null;
};

export const MobileSignInDetails: FC<{
    signIn: SignIn;
    host: string;
    email: string | undefined;
}> = ({ signIn, host, email }) => {
    const PhaseView = PHASE_VIEWS[signIn.phase];
    return (
        <PhaseView
            signIn={signIn}
            site={host}
            account={maskEmail(email) ?? S.fallbackAccount}
            platform={getPlatformLabel(signIn.state)}
        />
    );
};

export const MobileSignInStatus: FC<{ signIn: SignIn }> = ({ signIn }) => (
    <VisuallyHidden aria-live="polite">
        {getAnnouncement(signIn)}
    </VisuallyHidden>
);

export const MobileSignInStep: FC<{
    signIn: SignIn;
    host: string;
    email: string | undefined;
    qrPlaceholder?: ReactNode;
}> = ({ signIn, host, email, qrPlaceholder }) => (
    <Stack gap="sm">
        <MobileSignInQr signIn={signIn} placeholder={qrPlaceholder} />
        <MobileSignInDetails signIn={signIn} host={host} email={email} />
        <MobileSignInStatus signIn={signIn} />
    </Stack>
);
