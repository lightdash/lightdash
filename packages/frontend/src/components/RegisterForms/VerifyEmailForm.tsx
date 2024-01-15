import {
    Alert,
    Anchor,
    Button,
    PinInput,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { isNotEmpty, useForm } from '@mantine/form';
import { IconAlertCircle } from '@tabler/icons-react';
import { FC, useEffect } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import {
    useEmailStatus,
    useOneTimePassword,
    useVerifyEmail,
} from '../../hooks/useEmailVerification';
import { useApp } from '../../providers/AppProvider';
import LoadingState from '../common/LoadingState';
import MantineIcon from '../common/MantineIcon';

const VerifyEmailForm: FC<{ isLoading?: boolean }> = ({ isLoading }) => {
    const { health, user } = useApp();
    const { mutate: verifyCode, isLoading: verificationLoading } =
        useVerifyEmail();
    const { data, isInitialLoading: statusLoading } = useEmailStatus();
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
        // FIXME: update hardcoded widths with Mantine widths
        <Stack spacing="md" justify="center" align="center" w={300} mx="auto">
            <Title order={3}>Check your inbox!</Title>
            <Text color="gray.6" ta="center">
                Verify your email address by entering the code we've just sent
                to <b>{user?.data?.email || 'your email'}</b>
            </Text>
            <form
                name="verifyEmail"
                onSubmit={form.onSubmit((values: { code: string }) =>
                    verifyCode(values.code),
                )}
            >
                <Stack spacing="xs" justify="center" align="center" mt="md">
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
                    />
                    <Text ta="center" color="red.7">
                        {errorMessage?.toString()}
                    </Text>
                </Stack>
                <Countdown
                    key={expirationTime?.toString()}
                    date={expirationTime}
                    renderer={({ minutes, seconds, completed }) => {
                        if (completed) {
                            return (
                                <Alert
                                    icon={
                                        <MantineIcon icon={IconAlertCircle} />
                                    }
                                    color="orange.8"
                                    radius="xs"
                                >
                                    Your verification code has expired. Hit{' '}
                                    <Text span fw={500}>
                                        Resend verification email
                                    </Text>{' '}
                                    to receive a new code.
                                </Alert>
                            );
                        }
                        if (data?.otp?.isMaxAttempts) {
                            return <></>;
                        }
                        return (
                            // FIXME: update hardcoded widths with Mantine widths
                            <Stack spacing="xs" mt="md" w={250} align="center">
                                <Button
                                    fullWidth
                                    loading={verificationLoading}
                                    type="submit"
                                >
                                    Submit
                                </Button>
                                <Text color="gray.6" ta="center">
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
                size="sm"
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
