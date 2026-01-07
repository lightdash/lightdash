import { type EmailStatusExpiring } from '@lightdash/common';
import { Anchor, Button, PinInput, Stack, Text, Title } from '@mantine-8/core';
import { isNotEmpty, useForm } from '@mantine/form';
import { useEffect, type FC } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import {
    useOneTimePassword,
    useVerifyEmail,
} from '../../hooks/useEmailVerification';
import useApp from '../../providers/App/useApp';
import Callout from '../common/Callout';
import LoadingState from '../common/LoadingState';

const VerifyEmailForm: FC<{
    isLoading?: boolean;
    emailStatusData?: EmailStatusExpiring;
    statusLoading?: boolean;
}> = ({ isLoading, emailStatusData, statusLoading }) => {
    const { health } = useApp();
    const { mutate: verifyCode, isLoading: verificationLoading } =
        useVerifyEmail();
    const data = emailStatusData;
    const { mutate: sendVerificationEmail, isLoading: emailLoading } =
        useOneTimePassword();
    const form = useForm<{ code: string }>({
        initialValues: {
            code: '',
        },
        validate: {
            code: isNotEmpty('This field is required.'),
        },
    });
    const { setFieldError, clearFieldError } = form;
    const errorMessage = form.errors.code;
    const expirationTime = data?.otp?.expiresAt || new Date();
    const loadingState =
        statusLoading || emailLoading || health.isInitialLoading || isLoading;

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
            setFieldError('code', message);
        } else {
            clearFieldError('code');
        }
    }, [data, setFieldError, clearFieldError]);

    if (loadingState) {
        return <LoadingState title="" />;
    }

    return (
        <Stack gap="md" justify="center" align="center" w="100%" mx="auto">
            <Title order={3}>Check your inbox!</Title>
            <Text c="ldGray.8" ta="center" fz="sm">
                Verify your email address by entering the code we've just sent
                to{' '}
                <Text span fw={500} fz="sm" c="ldGray.8">
                    {data?.email || 'your email'}
                </Text>
                .
            </Text>
            <form
                name="verifyEmail"
                onSubmit={form.onSubmit((values: { code: string }) =>
                    verifyCode(values.code),
                )}
            >
                <Stack gap="xs" justify="center" align="center">
                    <PinInput
                        aria-label="One-time password"
                        name="code"
                        length={6}
                        oneTimeCode
                        disabled={
                            data?.otp?.isMaxAttempts || data?.otp?.isExpired
                        }
                        {...form.getInputProps('code')}
                        data-testid="pin-input"
                        autoFocus
                    />
                    <Text ta="center" c="red.7">
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
                                    title="Your verification code has expired."
                                >
                                    Hit{' '}
                                    <Text span fw={500} fz="sm">
                                        Resend verification email
                                    </Text>{' '}
                                    to receive a new code.
                                </Callout>
                            );
                        }
                        if (data?.otp?.isMaxAttempts) {
                            return <></>;
                        }
                        return (
                            <Stack gap="xs" mt="md" w="200" align="center">
                                <Button
                                    fullWidth
                                    loading={verificationLoading}
                                    type="submit"
                                >
                                    Submit
                                </Button>
                                <Text c="ldGray.6" ta="center">
                                    Your one-time password expires in{' '}
                                    <b>
                                        {zeroPad(minutes)}:{zeroPad(seconds)}
                                    </b>
                                </Text>
                            </Stack>
                        );
                    }}
                />
            </form>
            <Anchor
                fz="sm"
                component="button"
                onClick={() => {
                    form.reset();
                    sendVerificationEmail();
                }}
            >
                Resend verification email
            </Anchor>
        </Stack>
    );
};

export default VerifyEmailForm;
