import { Intent } from '@blueprintjs/core';
import React, { FC, useState } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import { Helmet } from 'react-helmet';
import { useForm } from 'react-hook-form';
import AnchorLink from '../components/common/AnchorLink';
import Page from '../components/common/Page/Page';
import {
    PasswordInputField,
    SubmitButton,
} from '../components/CreateUserForm/CreateUserForm.styles';
import PageSpinner from '../components/PageSpinner';
import Form from '../components/ReactHookForm/Form';
import { useApp } from '../providers/AppProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';
import {
    AnchorLinkWrapper,
    CardWrapper,
    ErrorMessage,
    FooterCta,
    FormFooterCopy,
    FormWrapper,
    Logo,
    LogoWrapper,
    Subtitle,
    Title,
} from './SignUp.styles';

const EmailVerification: FC<{
    nbrOfAttempts: number;
    expirationTime: string;
    // future time '2020-02-01T01:02:03'
    onSubmit: () => void;
    onResend: () => void;
}> = ({ nbrOfAttempts, expirationTime, onSubmit, onResend }) => {
    const { health } = useApp();
    const [countdownCompleted, setCountdownCompleted] =
        useState<boolean>(false);
    const methods = useForm({
        mode: 'onSubmit',
        defaultValues: {
            email: '',
        },
    });

    if (health.isLoading) {
        return <PageSpinner />;
    }

    return (
        <Page isFullHeight>
            <Helmet>
                <title>Verify your email - Lightdash</title>
            </Helmet>
            <FormWrapper>
                <LogoWrapper>
                    <Logo src={LightdashLogo} alt="lightdash logo" />
                </LogoWrapper>
                <CardWrapper elevation={2}>
                    <Title>Check your inbox!</Title>
                    <Subtitle>
                        Verify your e-mail address by entering the code we've
                        just sent to <b>email</b>@email.com
                    </Subtitle>
                    <Form
                        name="verify-email"
                        onSubmit={onSubmit}
                        methods={methods}
                    >
                        <PasswordInputField
                            label="One-time password"
                            name="otp"
                            placeholder="XXXXXX"
                            disabled={health.isLoading}
                            rules={{
                                required: 'Required field',
                            }}
                        />
                        {nbrOfAttempts < 5 ? (
                            <>
                                <Countdown
                                    date={expirationTime}
                                    renderer={({
                                        minutes,
                                        seconds,
                                        completed,
                                    }) => {
                                        if (completed) {
                                            setCountdownCompleted(completed);
                                            return (
                                                <Subtitle>
                                                    Your one-time password has
                                                    expired. <br /> Please
                                                    resend a verification email.
                                                </Subtitle>
                                            );
                                        }
                                        return (
                                            <Subtitle>
                                                Your one-time password expires
                                                in{' '}
                                                <b>
                                                    {zeroPad(minutes)}:
                                                    {zeroPad(seconds)}
                                                </b>
                                                <br />
                                                Attempts: {nbrOfAttempts}
                                                /5
                                            </Subtitle>
                                        );
                                    }}
                                />
                                <SubmitButton
                                    type="submit"
                                    intent={Intent.PRIMARY}
                                    text="Submit"
                                    loading={health.isLoading}
                                    disabled={countdownCompleted}
                                />
                            </>
                        ) : (
                            <ErrorMessage>
                                Hmm that password doesn't seem to match. You've
                                already had 5 attempts, please resend a
                                verification email and try again.
                            </ErrorMessage>
                        )}
                    </Form>
                    <AnchorLinkWrapper>
                        <AnchorLink href="/" onClick={onResend}>
                            Resend email
                        </AnchorLink>
                    </AnchorLinkWrapper>
                </CardWrapper>
                <FormFooterCopy>
                    You need to verify your email to get access to Lightdash. If
                    you need help, you can{' '}
                    <FooterCta href="/" target="_blank">
                        chat to support here.
                    </FooterCta>
                </FormFooterCopy>
            </FormWrapper>
        </Page>
    );
};

export default EmailVerification;
