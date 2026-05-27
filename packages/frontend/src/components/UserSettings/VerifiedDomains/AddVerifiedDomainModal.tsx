import { type DomainVerificationStatus } from '@lightdash/common';
import { Button, PinInput, Stack, Text, TextInput } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconWorldCheck } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import {
    useConfirmDomainVerification,
    useRequestDomainVerification,
} from '../../../hooks/organization/useOrganizationDomainVerification';
import Callout from '../../common/Callout';
import MantineModal from '../../common/MantineModal';

const attemptMessage = (
    otp: DomainVerificationStatus['otp'],
): string | null => {
    if (!otp || otp.numberOfAttempts === 0) return null;
    if (otp.isExpired) {
        return 'Your code expired. Resend a new verification email.';
    }
    if (otp.isMaxAttempts) {
        return "That code doesn't match. You've used all your attempts — resend a new code.";
    }
    return "That code doesn't match the one we sent. Try again.";
};

type Props = {
    opened: boolean;
    onClose: () => void;
};

/**
 * Two-step "verify a domain by email" flow: enter a domain + an address at it,
 * receive a one-time passcode, then confirm it. Mounted only while open, so its
 * state resets each time it is reopened.
 */
const AddVerifiedDomainModal: FC<Props> = ({ opened, onClose }) => {
    const requestVerification = useRequestDomainVerification();
    const confirmVerification = useConfirmDomainVerification();

    // The domain whose passcode we're collecting, plus its latest OTP status.
    const [pending, setPending] = useState<{
        domain: string;
        challengeEmail: string;
        status: DomainVerificationStatus;
    } | null>(null);
    const [code, setCode] = useState('');
    // Set when the countdown reaches zero — server flags are a fetch-time
    // snapshot, so this is what locks the input live on expiry.
    const [expired, setExpired] = useState(false);

    const form = useForm<{ domain: string; challengeEmail: string }>({
        initialValues: { domain: '', challengeEmail: '' },
        validate: {
            domain: (value) =>
                value.trim().length === 0 ? 'Enter a domain' : null,
        },
    });

    const handleRequest = form.onSubmit(async (values) => {
        const domain = values.domain.trim().toLowerCase();
        const challengeEmail =
            values.challengeEmail.trim() || `admin@${domain}`;
        try {
            const status = await requestVerification.mutateAsync({
                domain,
                challengeEmail,
            });
            if (status.isVerified) {
                onClose();
                return;
            }
            setCode('');
            setExpired(false);
            setPending({ domain, challengeEmail, status });
        } catch {
            // error toast is shown by the mutation's onError
        }
    });

    const handleConfirm = async () => {
        if (!pending || code.length < 6) return;
        try {
            const status = await confirmVerification.mutateAsync({
                domain: pending.domain,
                passcode: code,
            });
            if (status.isVerified) {
                onClose();
            } else {
                setPending({ ...pending, status });
                setCode('');
            }
        } catch {
            // error toast is shown by the mutation's onError
        }
    };

    const handleResend = async () => {
        if (!pending) return;
        try {
            const status = await requestVerification.mutateAsync({
                domain: pending.domain,
                challengeEmail: pending.challengeEmail,
            });
            setCode('');
            setExpired(false);
            setPending({ ...pending, status });
        } catch {
            // error toast is shown by the mutation's onError
        }
    };

    const otp = pending?.status.otp;
    const isLockedOut = expired || !!otp?.isExpired || !!otp?.isMaxAttempts;
    const error = attemptMessage(otp);

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={pending ? `Verify ${pending.domain}` : 'Add domain'}
            icon={IconWorldCheck}
            cancelLabel="Cancel"
            actions={
                pending ? (
                    <>
                        <Button
                            variant="default"
                            loading={requestVerification.isLoading}
                            onClick={handleResend}
                        >
                            Resend code
                        </Button>
                        <Button
                            loading={confirmVerification.isLoading}
                            disabled={code.length < 6 || isLockedOut}
                            onClick={handleConfirm}
                        >
                            Verify domain
                        </Button>
                    </>
                ) : (
                    <Button
                        loading={requestVerification.isLoading}
                        onClick={() => handleRequest()}
                    >
                        Send verification code
                    </Button>
                )
            }
        >
            {pending ? (
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        Enter the 6-digit code we sent to{' '}
                        <Text span fw={500}>
                            {pending.challengeEmail}
                        </Text>{' '}
                        to verify{' '}
                        <Text span fw={500}>
                            {pending.domain}
                        </Text>
                        .
                    </Text>
                    <PinInput
                        aria-label="Domain verification code"
                        length={6}
                        oneTimeCode
                        value={code}
                        onChange={setCode}
                        disabled={isLockedOut}
                        autoFocus
                    />
                    {error && (
                        <Text c="red.7" size="sm">
                            {error}
                        </Text>
                    )}
                    {otp && !isLockedOut && (
                        <Countdown
                            key={otp.expiresAt.toString()}
                            date={otp.expiresAt}
                            onComplete={() => setExpired(true)}
                            renderer={({ minutes, seconds, completed }) =>
                                completed ? (
                                    <Callout
                                        variant="warning"
                                        title="Your verification code has expired."
                                    >
                                        Resend a new code to continue.
                                    </Callout>
                                ) : (
                                    <Text c="dimmed" size="sm">
                                        Code expires in {zeroPad(minutes)}:
                                        {zeroPad(seconds)}
                                    </Text>
                                )
                            }
                        />
                    )}
                </Stack>
            ) : (
                <form onSubmit={handleRequest}>
                    <Stack gap="md">
                        <TextInput
                            label="Domain"
                            placeholder="acme.com"
                            description="The domain your organization owns."
                            data-autofocus
                            {...form.getInputProps('domain')}
                        />
                        <TextInput
                            label="Send code to"
                            placeholder={`admin@${
                                form.values.domain.trim() || 'your-domain.com'
                            }`}
                            description="An email address at this domain."
                            {...form.getInputProps('challengeEmail')}
                        />
                    </Stack>
                </form>
            )}
        </MantineModal>
    );
};

export default AddVerifiedDomainModal;
