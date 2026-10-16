import { type LightdashUser } from '@lightdash/common';
import { Anchor, Button, PinInput, Stack, Text } from '@mantine/core';
import { isNotEmpty, useForm } from '@mantine/form';
import { useCallback, useEffect, useRef, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import useToaster from '../../../hooks/toaster/useToaster';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import {
    useEmailOtpRequestMutation,
    useEmailOtpVerifyMutation,
} from '../hooks/useLogin';

const LoginWithEmailOtp: FC<{
    email: string;
    disabled?: boolean;
    onSuccess: (user: LightdashUser) => void;
}> = ({ email, disabled, onSuccess }) => {
    const { t } = useTranslation('auth');
    const { showToastApiError, showToastSuccess } = useToaster();
    const { track } = useTracking();

    const form = useForm<{ passcode: string }>({
        initialValues: { passcode: '' },
        validate: { passcode: isNotEmpty(t('otp.required')) },
    });

    const { mutate: requestCode, isLoading: isRequesting } =
        useEmailOtpRequestMutation();

    const requestCodeForEmail = useCallback(
        (onRequestSuccess?: () => void) => {
            requestCode(email, {
                onSuccess: onRequestSuccess,
                onError: ({ error }) =>
                    showToastApiError({
                        title: t('otp.sendFailed', { email }),
                        apiError: error,
                    }),
            });
        },
        [requestCode, email, showToastApiError, t],
    );

    const requestedRef = useRef(false);
    useEffect(() => {
        if (requestedRef.current) return;
        requestedRef.current = true;
        requestCodeForEmail();
    }, [requestCodeForEmail]);

    const {
        mutate: verifyCode,
        isLoading: isVerifying,
        error: verifyError,
    } = useEmailOtpVerifyMutation({
        onSuccess,
        onError: () => {
            form.reset();
        },
    });

    const submitInFlightRef = useRef(false);
    const submitCode = useCallback(
        (passcode: string) => {
            if (
                passcode.length !== 6 ||
                submitInFlightRef.current ||
                isVerifying
            ) {
                return;
            }
            submitInFlightRef.current = true;
            verifyCode(
                { email, passcode },
                {
                    onSettled: () => {
                        submitInFlightRef.current = false;
                    },
                },
            );
        },
        [email, isVerifying, verifyCode],
    );

    const errorMessage = verifyError?.error?.message;

    return (
        <Stack gap="md">
            <Text c="ldGray.8" fz="sm">
                <Trans
                    t={t}
                    i18nKey="otp.sentTo"
                    values={{ email }}
                    components={{
                        email: <Text span fw={500} fz="sm" c="ldGray.8" />,
                    }}
                />
            </Text>
            <Stack gap="xs" align="center">
                <PinInput
                    aria-label={t('otp.inputLabel')}
                    name="passcode"
                    length={6}
                    oneTimeCode
                    autoFocus
                    disabled={isVerifying || disabled}
                    {...form.getInputProps('passcode')}
                    onComplete={submitCode}
                    data-testid="pin-input"
                />
                {errorMessage && (
                    <Text ta="center" c="red.7" fz="sm">
                        {errorMessage.toString()}
                    </Text>
                )}
            </Stack>
            <Button
                fullWidth
                loading={isVerifying}
                disabled={disabled}
                onClick={() => submitCode(form.values.passcode)}
                data-cy="signin-button"
            >
                {t('otp.signIn')}
            </Button>
            <Anchor
                fz="sm"
                mx="auto"
                component="button"
                type="button"
                disabled={isRequesting}
                onClick={() => {
                    track({
                        name: EventName.OTP_RESEND_CLICKED,
                        properties: { purpose: 'login' },
                    });
                    form.reset();
                    requestCodeForEmail(() => {
                        showToastSuccess({
                            title: t('otp.resent', { email }),
                        });
                    });
                }}
            >
                {t('otp.resend')}
            </Anchor>
        </Stack>
    );
};

export default LoginWithEmailOtp;
