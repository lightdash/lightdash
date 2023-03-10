import { Intent, Spinner } from '@blueprintjs/core';
import { EmailStatusExpiring } from '@lightdash/common';
import React, { FC, useEffect } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import { UseFormReturn } from 'react-hook-form';
import { AnchorLinkWrapper, Subtitle, Title } from '../../pages/SignUp.styles';
import Form from '../ReactHookForm/Form';
import PasswordInput from '../ReactHookForm/PasswordInput';
import { FormWrapper, LinkButton, SubmitButton } from './CreateUserForm.styles';

export const VerifyEmailForm: FC<{
    email: string | undefined;
    methods: UseFormReturn<{ code: string }>;
    data: EmailStatusExpiring | undefined;
    expirationTime: Date | string | undefined;
    onSubmit: (data: { code: string }) => void;
    onResend: () => void;
    isLoading: boolean;
    verificationLoading: boolean;
}> = ({
    email,
    methods,
    data,
    expirationTime,
    onSubmit,
    onResend,
    isLoading,
    verificationLoading,
}) => {
    const { setError, clearErrors } = methods;

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
            setError('code', { type: 'custom', message });
        } else {
            clearErrors('code');
        }
    }, [data, clearErrors, setError]);

    if (isLoading) {
        return (
            <div style={{ margin: '50px' }}>
                <Spinner />
            </div>
        );
    }

    return (
        <FormWrapper>
            <Title>Check your inbox!</Title>
            <Subtitle>
                Verify your e-mail address by entering the code we've just sent
                to <b>{email}</b>
            </Subtitle>
            <Form name="verify-email" onSubmit={onSubmit} methods={methods}>
                <PasswordInput
                    label="One-time password"
                    name="code"
                    placeholder="XXXXXX"
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={data?.otp?.isMaxAttempts}
                />
                <Countdown
                    key={expirationTime?.toString()}
                    date={expirationTime}
                    renderer={({ minutes, seconds, completed }) => {
                        if (completed || data?.otp?.isMaxAttempts) {
                            return <></>;
                        }
                        return (
                            <>
                                <Subtitle>
                                    Your one-time password expires in{' '}
                                    <b>
                                        {zeroPad(minutes)}:{zeroPad(seconds)}
                                    </b>
                                </Subtitle>
                                <SubmitButton
                                    type="submit"
                                    intent={Intent.PRIMARY}
                                    text="Submit"
                                    loading={verificationLoading}
                                />
                            </>
                        );
                    }}
                />
                <AnchorLinkWrapper>
                    <LinkButton onClick={onResend}>Resend email</LinkButton>
                </AnchorLinkWrapper>
            </Form>
        </FormWrapper>
    );
};
