import { Anchor, Box, Button, PinInput, Stack, Text } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { type FC } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import Callout from '../common/Callout';
import classes from './VerifyEmailCodeForm.module.css';

type Props = {
    form: UseFormReturnType<{ code: string }>;
    onSubmitCode: (code: string) => void;
    onResend: () => void;
    expirationTime: Date;
    isDisabled: boolean;
    isMaxAttempts: boolean;
    isVerified: boolean;
    isVerifying: boolean;
};

const VerifyEmailCodeForm: FC<Props> = ({
    form,
    onSubmitCode,
    onResend,
    expirationTime,
    isDisabled,
    isMaxAttempts,
    isVerified,
    isVerifying,
}) => {
    const errorMessage = form.errors.code;

    return (
        <form
            name="verifyEmail"
            onSubmit={form.onSubmit((values) => onSubmitCode(values.code))}
        >
            <Stack gap="md">
                <PinInput
                    aria-label="One-time password"
                    name="code"
                    length={6}
                    size="lg"
                    placeholder=""
                    oneTimeCode
                    disabled={isDisabled}
                    {...form.getInputProps('code')}
                    onComplete={onSubmitCode}
                    classNames={{
                        root: classes.pinRoot,
                        pinInput: classes.pinCell,
                        input: classes.pinField,
                    }}
                    data-testid="pin-input"
                    data-auth-progress
                    autoFocus
                />
                {errorMessage && (
                    <Text c="red" fz="sm" className={classes.errorSlot}>
                        {errorMessage.toString()}
                    </Text>
                )}
                <Countdown
                    key={expirationTime.toString()}
                    date={expirationTime}
                    renderer={({ minutes, seconds, completed }) => {
                        if (completed && !isVerified) {
                            return (
                                <Callout
                                    variant="warning"
                                    title="Your verification code has expired."
                                >
                                    <Anchor
                                        component="button"
                                        type="button"
                                        fz="sm"
                                        onClick={onResend}
                                    >
                                        Send a new code
                                    </Anchor>
                                </Callout>
                            );
                        }
                        return (
                            <Stack gap="md">
                                {!isMaxAttempts && (
                                    <Button type="submit" loading={isVerifying}>
                                        Verify email
                                    </Button>
                                )}
                                <Text mx="auto" mt="md" fz="sm">
                                    Didn't get it?{' '}
                                    <Anchor
                                        component="button"
                                        type="button"
                                        fz="sm"
                                        onClick={onResend}
                                    >
                                        Resend code
                                    </Anchor>
                                    {!isMaxAttempts && (
                                        <Text
                                            span
                                            c="dimmed"
                                            fz="sm"
                                            className={classes.countdown}
                                        >
                                            {' '}
                                            · Expires in {zeroPad(minutes)}:
                                            {zeroPad(seconds)}
                                        </Text>
                                    )}
                                </Text>
                            </Stack>
                        );
                    }}
                />
                {!errorMessage && (
                    <Box className={classes.errorSlot} aria-hidden />
                )}
            </Stack>
        </form>
    );
};

export default VerifyEmailCodeForm;
