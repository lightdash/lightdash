import { Intent } from '@blueprintjs/core';
import React, { FC, useState } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import { useForm } from 'react-hook-form';
import {
    AnchorLinkWrapper,
    ErrorMessage,
    Subtitle,
} from '../../pages/SignUp.styles';
import AnchorLink from '../common/AnchorLink';
import Form from '../ReactHookForm/Form';
import { PasswordInputField, SubmitButton } from './CreateUserForm.styles';

export const VerifyEmailForm: FC<{
    numberOfAttempts: number;
    expirationTime: string;
    onSubmit: (code: string) => void;
    onResend: () => void;
}> = ({ numberOfAttempts, expirationTime, onSubmit, onResend }) => {
    const methods = useForm({
        mode: 'onSubmit',
        defaultValues: {
            code: '',
        },
    });
    return (
        <Form name="verify-email" onSubmit={onSubmit} methods={methods}>
            <PasswordInputField
                label="One-time password"
                name="otp"
                placeholder="XXXXXX"
                rules={{
                    required: 'Required field',
                }}
            />
            {numberOfAttempts < 5 ? (
                <>
                    <Countdown
                        date={expirationTime}
                        renderer={({ minutes, seconds, completed }) => {
                            if (completed) {
                                return (
                                    <ErrorMessage>
                                        Your one-time password has expired.{' '}
                                        <br /> Please resend a verification
                                        email.
                                    </ErrorMessage>
                                );
                            }
                            return (
                                <Subtitle>
                                    Your one-time password expires in{' '}
                                    <b>
                                        {zeroPad(minutes)}:{zeroPad(seconds)}
                                    </b>
                                </Subtitle>
                            );
                        }}
                    />
                </>
            ) : (
                <ErrorMessage>
                    Hmm that password doesn't match the one we sent you. You've
                    already had 5 attempts, please resend a verification email
                    and try again.
                </ErrorMessage>
            )}
            <AnchorLinkWrapper>
                <AnchorLink href="/" onClick={onResend}>
                    Resend email
                </AnchorLink>
            </AnchorLinkWrapper>
        </Form>
    );
};
