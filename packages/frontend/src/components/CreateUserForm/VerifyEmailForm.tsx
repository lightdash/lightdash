import { Button, Intent } from '@blueprintjs/core';
import React, { FC, useEffect } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import { UseFormReturn } from 'react-hook-form';
import { useIntercom } from 'react-use-intercom';
import {
    AnchorLinkWrapper,
    CardWrapper,
    FormFooterCopy,
    FormWrapper,
    Logo,
    LogoWrapper,
    Subtitle,
    Title,
} from '../../pages/SignUp.styles';
import LightdashLogo from '../../svgs/lightdash-black.svg';
import Form from '../ReactHookForm/Form';
import PasswordInput from '../ReactHookForm/PasswordInput';
import { LinkButton, SubmitButton } from './CreateUserForm.styles';

export const VerifyEmailForm: FC<{
    email: string;
    methods: UseFormReturn<{ code: string }>;
    expirationTime: string;
    onSubmit: (data: { code: string }) => void;
    onResend: () => void;
}> = ({ email, methods, expirationTime, onSubmit, onResend }) => {
    const { show: showIntercom } = useIntercom();

    return (
        <FormWrapper>
            <LogoWrapper>
                <Logo src={LightdashLogo} alt="lightdash logo" />
            </LogoWrapper>
            <CardWrapper elevation={2}>
                <Title>Check your inbox!</Title>
                <Subtitle>
                    Verify your e-mail address by entering the code we've just
                    sent to <b>{email}</b>
                </Subtitle>

                <Form name="verify-email" onSubmit={onSubmit} methods={methods}>
                    <PasswordInput
                        label="One-time password"
                        name="code"
                        placeholder="XXXXXX"
                        rules={{
                            required: 'Required field',
                        }}
                    />
                    <Countdown
                        date={expirationTime}
                        onComplete={() => {
                            const message =
                                'Your one-time password expired. Please resend a verification email.';
                            methods.setError('code', {
                                type: 'custom',
                                message,
                            });
                        }}
                        renderer={({ minutes, seconds, completed }) => {
                            if (completed) {
                                return <></>;
                            }
                            return (
                                <>
                                    <Subtitle>
                                        Your one-time password expires in{' '}
                                        <b>
                                            {zeroPad(minutes)}:
                                            {zeroPad(seconds)}
                                        </b>
                                    </Subtitle>
                                    <SubmitButton
                                        type="submit"
                                        intent={Intent.PRIMARY}
                                        text="Submit"
                                    />
                                </>
                            );
                        }}
                    />
                    <AnchorLinkWrapper>
                        <LinkButton onClick={onResend}>Resend email</LinkButton>
                    </AnchorLinkWrapper>
                </Form>
            </CardWrapper>
            <FormFooterCopy>
                You need to verify your email to get access to Lightdash. If you
                need help, you can
                <LinkButton onClick={() => showIntercom()}>
                    chat to support here.
                </LinkButton>
            </FormFooterCopy>
        </FormWrapper>
    );
};
