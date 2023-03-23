import {
    Anchor,
    Button,
    PasswordInput,
    Stack,
    Text,
    Title,
    UnstyledButton,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import React, { FC, useEffect } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import {
    useEmailStatus,
    useOneTimePassword,
    useVerifyEmail,
} from '../../hooks/useEmailVerification';
import { useApp } from '../../providers/AppProvider';
import LoadingState from '../common/LoadingState';

export const VerifyEmailForm: FC<{ isLoading?: boolean }> = ({ isLoading }) => {
    const { health, user } = useApp();
    const { mutate: verifyCode, isLoading: verificationLoading } =
        useVerifyEmail();
    const { data, isLoading: statusLoading } = useEmailStatus();
    const { mutate: sendVerificationEmail, isLoading: emailLoading } =
        useOneTimePassword();
    const form = useForm<{ code: string }>({
        initialValues: {
            code: '',
        },
    });
    const expirationTime = data?.otp?.expiresAt || new Date();
    const loadingState =
        statusLoading || emailLoading || health.isLoading || isLoading;

    useEffect(() => {
        if (data?.otp && data?.otp.numberOfAttempts > 0) {
            const remainingAttempts = 5 - data.otp.numberOfAttempts;
            const message = data.otp.isExpired
                ? 'Your one-time password expired. Please resend a verification email.'
                : data.otp.numberOfAttempts < 5
                ? `The code doesn't match the one we sent you. You have ${remainingAttempts} attempt${
                      remainingAttempts > 1 ? 's' : ''
                  } left.`
                : "Hmm that code doesn't match the one we sent you. You've already had 5 attempts, please resend a verification email and try again.";
            form.setFieldError('code', message);
        } else {
            form.clearFieldError('code');
        }
    }, [data, form.setFieldError, form.clearFieldError]);

    if (loadingState) {
        return <LoadingState title="" />;
    }

    return (
        <Stack align="center" spacing="md">
            <Title order={3}>Check your inbox!</Title>
            <Text color="gray.6" ta="center">
                Verify your email address by entering the code we've just sent
                to <b>{user?.data?.email || 'your email'}</b>
            </Text>
            <Stack spacing="md" w={290}>
                <form
                    name="verifyEmail"
                    onSubmit={form.onSubmit((values: { code: string }) =>
                        verifyCode(values.code),
                    )}
                >
                    <PasswordInput
                        label="One-time password"
                        name="code"
                        placeholder="XXXXXX"
                        required
                        disabled={data?.otp?.isMaxAttempts}
                        styles={{
                            label: {
                                marginBottom: '5px',
                            },
                        }}
                        {...form.getInputProps('code')}
                    />
                    <Countdown
                        key={expirationTime?.toString()}
                        date={expirationTime}
                        renderer={({ minutes, seconds, completed }) => {
                            if (completed || data?.otp?.isMaxAttempts) {
                                return <></>;
                            }
                            return (
                                <Stack spacing="md" mt="md">
                                    <Text color="gray.6" ta="center">
                                        Your one-time password expires in{' '}
                                        <b>
                                            {zeroPad(minutes)}:
                                            {zeroPad(seconds)}
                                        </b>
                                    </Text>
                                    <Button
                                        loading={verificationLoading}
                                        type="submit"
                                    >
                                        Submit
                                    </Button>
                                </Stack>
                            );
                        }}
                    />
                </form>
            </Stack>
            <UnstyledButton
                onClick={() => {
                    form.reset();
                    sendVerificationEmail();
                }}
            >
                <Anchor size="sm">Resend email</Anchor>
            </UnstyledButton>
        </Stack>
    );
};
