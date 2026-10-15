import { type DomainVerificationStatus } from '@lightdash/common';
import { Button, PinInput, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconWorldCheck } from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { useState, type FC } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import { Trans, useTranslation } from 'react-i18next';
import {
    useConfirmDomainVerification,
    useRequestDomainVerification,
} from '../../../hooks/organization/useOrganizationDomainVerification';
import Callout from '../../common/Callout';
import MantineModal from '../../common/MantineModal';

const attemptMessage = (
    otp: DomainVerificationStatus['otp'],
    t: TFunction<'userSettings'>,
): string | null => {
    if (!otp || otp.numberOfAttempts === 0) return null;
    if (otp.isExpired) {
        return t('verifiedDomains.addModal.codeExpired');
    }
    if (otp.isMaxAttempts) {
        return t('verifiedDomains.addModal.maxAttempts');
    }
    return t('verifiedDomains.addModal.codeMismatch');
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
    const { t } = useTranslation('userSettings');
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
                value.trim().length === 0
                    ? t('verifiedDomains.addModal.domainRequired')
                    : null,
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
    const error = attemptMessage(otp, t);

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={
                pending
                    ? t('verifiedDomains.addModal.verifyTitle', {
                          domain: pending.domain,
                      })
                    : t('verifiedDomains.addModal.addTitle')
            }
            icon={IconWorldCheck}
            cancelLabel={t('actions.cancel', { ns: 'common' })}
            actions={
                pending ? (
                    <>
                        <Button
                            variant="default"
                            loading={requestVerification.isLoading}
                            onClick={handleResend}
                        >
                            {t('verifiedDomains.addModal.resendCode')}
                        </Button>
                        <Button
                            loading={confirmVerification.isLoading}
                            disabled={code.length < 6 || isLockedOut}
                            onClick={handleConfirm}
                        >
                            {t('verifiedDomains.addModal.verifyDomain')}
                        </Button>
                    </>
                ) : (
                    <Button
                        loading={requestVerification.isLoading}
                        onClick={() => handleRequest()}
                    >
                        {t('verifiedDomains.addModal.sendCode')}
                    </Button>
                )
            }
        >
            {pending ? (
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        <Trans
                            t={t}
                            i18nKey="verifiedDomains.addModal.enterCode"
                            values={{
                                email: pending.challengeEmail,
                                domain: pending.domain,
                            }}
                            components={{ b: <Text span fw={500} /> }}
                        />
                    </Text>
                    <PinInput
                        aria-label={t('verifiedDomains.addModal.codeAriaLabel')}
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
                                        title={t(
                                            'verifiedDomains.addModal.expiredTitle',
                                        )}
                                    >
                                        {t(
                                            'verifiedDomains.addModal.expiredBody',
                                        )}
                                    </Callout>
                                ) : (
                                    <Text c="dimmed" size="sm">
                                        {t(
                                            'verifiedDomains.addModal.expiresIn',
                                            {
                                                minutes: zeroPad(minutes),
                                                seconds: zeroPad(seconds),
                                            },
                                        )}
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
                            label={t('verifiedDomains.addModal.domain')}
                            placeholder="acme.com"
                            description={t(
                                'verifiedDomains.addModal.domainDescription',
                            )}
                            data-autofocus
                            {...form.getInputProps('domain')}
                        />
                        <TextInput
                            label={t('verifiedDomains.addModal.sendCodeTo')}
                            placeholder={`admin@${
                                form.values.domain.trim() || 'your-domain.com'
                            }`}
                            description={t(
                                'verifiedDomains.addModal.sendCodeToDescription',
                            )}
                            {...form.getInputProps('challengeEmail')}
                        />
                    </Stack>
                </form>
            )}
        </MantineModal>
    );
};

export default AddVerifiedDomainModal;
