import { type EmailStatusExpiring } from '@lightdash/common';
import { Anchor, Button, PinInput, Stack, Text, Title } from '@mantine/core';
import { isNotEmpty, useForm } from '@mantine/form';
import { useEffect, useRef, type FC } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import { Trans, useTranslation } from 'react-i18next';
import {
    useOneTimePassword,
    useVerifyEmail,
} from '../../hooks/useEmailVerification';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { useAuthPanel } from '../common/AuthLayout/AuthPanelContext';
import Callout from '../common/Callout';
import EmptyStateLoader from '../common/EmptyStateLoader';
import VerifyEmailCodeForm from './VerifyEmailCodeForm';

const VerifyEmailForm: FC<{
    isLoading?: boolean;
    emailStatusData?: EmailStatusExpiring;
    statusLoading?: boolean;
    align?: 'center' | 'left';
}> = ({ isLoading, emailStatusData, statusLoading, align = 'center' }) => {
    const { t } = useTranslation('auth');
    const isLeftAligned = align === 'left';
    const { health } = useApp();
    const { track } = useTracking();
    const { mutate: verifyCode, isLoading: verificationLoading } =
        useVerifyEmail();
    const data = emailStatusData;
    const { mutate: sendVerificationEmail, isLoading: emailLoading } =
        useOneTimePassword();
    const form = useForm<{ code: string }>({
        initialValues: {
            code: '',
        },
        clearInputErrorOnChange: false,
        validate: {
            code: isNotEmpty(t('otp.required')),
        },
    });
    const { setFieldError, clearFieldError } = form;
    const { startChecking, flashError } = useAuthPanel();
    const submitInFlightRef = useRef(false);
    const submitCode = (code: string) => {
        if (submitInFlightRef.current || verificationLoading) {
            return;
        }
        submitInFlightRef.current = true;
        startChecking();
        verifyCode(code, {
            onSuccess: (result) => {
                if (!result.isVerified) flashError();
            },
            onError: () => flashError(),
            onSettled: () => {
                submitInFlightRef.current = false;
            },
        });
    };
    const errorMessage = form.errors.code;
    const expirationTime = data?.otp?.expiresAt || new Date();
    const loadingState =
        statusLoading || emailLoading || health.isInitialLoading || isLoading;

    useEffect(() => {
        if (data?.otp && data?.otp.numberOfAttempts > 0) {
            const remainingAttempts = 5 - data.otp.numberOfAttempts;
            const message = data.otp.isExpired
                ? t('verifyEmail.expiredSendNew')
                : data.otp.numberOfAttempts < 5
                  ? t('verifyEmail.wrongCode', { count: remainingAttempts })
                  : t('verifyEmail.tooManyAttempts');
            setFieldError('code', message);
        } else {
            clearFieldError('code');
        }
    }, [data, setFieldError, clearFieldError, t]);

    const resendCode = () => {
        track({
            name: EventName.OTP_RESEND_CLICKED,
            properties: { purpose: 'signup_verification' },
        });
        form.reset();
        sendVerificationEmail();
    };

    if (loadingState) {
        return <EmptyStateLoader my="xl" />;
    }

    if (isLeftAligned) {
        return (
            <VerifyEmailCodeForm
                form={form}
                onSubmitCode={submitCode}
                onResend={resendCode}
                expirationTime={expirationTime}
                isDisabled={
                    !!data?.otp?.isMaxAttempts ||
                    !!data?.otp?.isExpired ||
                    verificationLoading
                }
                isMaxAttempts={!!data?.otp?.isMaxAttempts}
                isVerified={!!emailStatusData?.isVerified}
                isVerifying={verificationLoading}
            />
        );
    }

    return (
        <Stack
            gap="md"
            justify="center"
            align={isLeftAligned ? 'stretch' : 'center'}
            w="100%"
            mx="auto"
        >
            <Title order={3}>{t('verifyEmail.checkInbox')}</Title>
            <Text c="ldGray.8" ta={align} fz="sm">
                <Trans
                    t={t}
                    i18nKey="verifyEmail.enterCode"
                    values={{
                        email: data?.email || t('verifyEmail.yourEmail'),
                    }}
                    components={{
                        email: <Text span fw={500} fz="sm" c="ldGray.8" />,
                    }}
                />
            </Text>
            <form
                name="verifyEmail"
                onSubmit={form.onSubmit((values: { code: string }) =>
                    submitCode(values.code),
                )}
            >
                <Stack
                    gap="xs"
                    justify="center"
                    align={isLeftAligned ? 'flex-start' : 'center'}
                >
                    <PinInput
                        aria-label={t('otp.inputLabel')}
                        name="code"
                        length={6}
                        oneTimeCode
                        disabled={
                            data?.otp?.isMaxAttempts ||
                            data?.otp?.isExpired ||
                            verificationLoading
                        }
                        {...form.getInputProps('code')}
                        onComplete={submitCode}
                        data-testid="pin-input"
                        autoFocus
                    />
                    <Text ta={align} c="red.7">
                        {errorMessage?.toString()}
                    </Text>
                </Stack>
                <Countdown
                    key={expirationTime?.toString()}
                    date={expirationTime}
                    renderer={({ minutes, seconds, completed }) => {
                        if (completed && !emailStatusData?.isVerified) {
                            return (
                                <Callout
                                    variant="warning"
                                    title={t('verifyEmail.codeExpired')}
                                >
                                    <Trans
                                        t={t}
                                        i18nKey="verifyEmail.hitResend"
                                        components={{
                                            strong: (
                                                <Text span fw={500} fz="sm" />
                                            ),
                                        }}
                                    />
                                </Callout>
                            );
                        }
                        if (data?.otp?.isMaxAttempts) {
                            return <></>;
                        }
                        return (
                            <Stack
                                gap="xs"
                                mt="md"
                                w={isLeftAligned ? '100%' : '200'}
                                align={isLeftAligned ? 'stretch' : 'center'}
                                ml={isLeftAligned ? undefined : 'auto'}
                                mr={isLeftAligned ? undefined : 'auto'}
                            >
                                <Button
                                    fullWidth
                                    loading={verificationLoading}
                                    type="submit"
                                >
                                    {t('verifyEmail.submit')}
                                </Button>
                                <Text c="dimmed" ta={align} fz="sm" fw={500}>
                                    {t('verifyEmail.otpExpiresIn')}{' '}
                                    <Text span fw={500} fz="sm" c="ldGray.7">
                                        {zeroPad(minutes)}:{zeroPad(seconds)}
                                    </Text>
                                </Text>
                            </Stack>
                        );
                    }}
                />
            </form>
            <Anchor
                fz="sm"
                ta={isLeftAligned ? 'left' : undefined}
                component="button"
                onClick={resendCode}
            >
                {t('verifyEmail.resendEmail')}
            </Anchor>
        </Stack>
    );
};

export default VerifyEmailForm;
