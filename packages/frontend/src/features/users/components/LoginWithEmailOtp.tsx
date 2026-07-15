import { type LightdashUser } from '@lightdash/common';
import { Anchor, Button, PinInput, Stack, Text } from '@mantine-8/core';
import { isNotEmpty, useForm } from '@mantine/form';
import { useCallback, useEffect, useRef, type FC } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useEmailOtpRequestMutation,
    useEmailOtpVerifyMutation,
} from '../hooks/useLogin';

const LoginWithEmailOtp: FC<{
    email: string;
    disabled?: boolean;
    onSuccess: (user: LightdashUser) => void;
}> = ({ email, disabled, onSuccess }) => {
    const { showToastApiError, showToastSuccess } = useToaster();

    const form = useForm<{ passcode: string }>({
        initialValues: { passcode: '' },
        validate: { passcode: isNotEmpty('This field is required.') },
    });

    const { mutate: requestCode, isLoading: isRequesting } =
        useEmailOtpRequestMutation();

    const requestCodeForEmail = useCallback(
        (onRequestSuccess?: () => void) => {
            requestCode(email, {
                onSuccess: onRequestSuccess,
                onError: ({ error }) =>
                    showToastApiError({
                        title: `Failed to send a code to ${email}`,
                        apiError: error,
                    }),
            });
        },
        [requestCode, email, showToastApiError],
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
                We've emailed a 6-digit code to{' '}
                <Text span fw={500} fz="sm" c="ldGray.8">
                    {email}
                </Text>
                . Enter it below to sign in.
            </Text>
            <Stack gap="xs" align="center">
                <PinInput
                    aria-label="One-time password"
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
                Sign in
            </Button>
            <Anchor
                fz="sm"
                mx="auto"
                component="button"
                type="button"
                disabled={isRequesting}
                onClick={() => {
                    form.reset();
                    requestCodeForEmail(() => {
                        showToastSuccess({
                            title: `We've sent a new code to ${email}`,
                        });
                    });
                }}
            >
                Resend code
            </Anchor>
        </Stack>
    );
};

export default LoginWithEmailOtp;
