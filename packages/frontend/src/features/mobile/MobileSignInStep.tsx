import {
    MobileSignInRefusal,
    type MobileSignInCodeState,
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
import { IconCircleCheck } from '@tabler/icons-react';
import { lazy, Suspense, type FC } from 'react';
import Callout from '../../components/common/Callout';
import MantineIcon from '../../components/common/MantineIcon';
import MantineModal from '../../components/common/MantineModal';
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
    signIn.isMinting ? (
        <Box className={classes.qrFrame}>
            <Loader size="sm" aria-label={MOBILE_STRINGS.creatingCode} />
        </Box>
    ) : (
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

const ShownCode: FC<StepContext> = ({ signIn }) =>
    signIn.code ? (
        <Group align="flex-start" gap="lg">
            <Box className={classes.qrFrame}>
                <Suspense fallback={<Loader size="sm" />}>
                    <MobileAppQrCode
                        value={signIn.code.signInUrl}
                        label={S.qrLabel}
                    />
                </Suspense>
            </Box>
            <Stack gap="sm" className={classes.details}>
                <Text size="sm">{MOBILE_STRINGS.waitingForScan}</Text>
            </Stack>
        </Group>
    ) : null;

const ClaimedNote: FC<StepContext> = () => null;

const ApprovedNumber: FC<StepContext> = ({ signIn }) =>
    signIn.state?.matchNumber ? (
        <Stack gap="xs" align="flex-start">
            <Text size="sm" fw={600}>
                {S.typeOnPhone}
            </Text>
            <MatchNumber value={signIn.state.matchNumber} />
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

const DeclinedCode: FC<StepContext> = ({ signIn }) => (
    <Stack gap="sm" align="flex-start">
        <Callout variant="neutral" title={S.declined} w="100%" />
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
    claimed: ClaimedNote,
    approved: ApprovedNumber,
    expired: ExpiredCode,
    declined: DeclinedCode,
    redeemed: SignedIn,
};

const ConfirmModal: FC<StepContext> = ({ signIn, site, account, platform }) => (
    <MantineModal
        opened={signIn.phase === 'claimed'}
        onClose={signIn.decline}
        title={S.confirm.title}
        description={S.confirm.description}
        role="alertdialog"
        size="md"
        withCloseButton={false}
        modalRootProps={{ returnFocus: false }}
        cancelLabel={S.confirm.decline}
        onCancel={signIn.decline}
        cancelDisabled={signIn.isDeciding}
        confirmLabel={S.confirm.approve}
        onConfirm={signIn.approve}
        confirmLoading={signIn.isDeciding}
    >
        <Stack gap="md">
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
            {signIn.state?.matchNumber && (
                <Stack gap="xs" align="center">
                    <Text size="sm" fw={600}>
                        {S.typeOnPhone}
                    </Text>
                    <MatchNumber value={signIn.state.matchNumber} />
                </Stack>
            )}
        </Stack>
    </MantineModal>
);

const getAnnouncement = (signIn: SignIn): string => {
    if (signIn.phase === 'showing' && signIn.isRefreshed) return S.refreshed;
    if (signIn.phase === 'approved' && signIn.state?.matchNumber) {
        return `${S.typeOnPhone}: ${spellNumber(signIn.state.matchNumber)}`;
    }
    return '';
};

export const MobileSignInStep: FC<{
    signIn: SignIn;
    host: string;
    email: string | undefined;
}> = ({ signIn, host, email }) => {
    const context: StepContext = {
        signIn,
        site: host,
        account: maskEmail(email) ?? S.fallbackAccount,
        platform: getPlatformLabel(signIn.state),
    };
    const PhaseView = PHASE_VIEWS[signIn.phase];

    return (
        <Stack gap="sm">
            <PhaseView {...context} />
            <ConfirmModal {...context} />
            <VisuallyHidden aria-live="polite">
                {getAnnouncement(signIn)}
            </VisuallyHidden>
        </Stack>
    );
};
