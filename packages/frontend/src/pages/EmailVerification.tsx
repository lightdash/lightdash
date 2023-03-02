import { Intent } from '@blueprintjs/core';
import React, { FC, useState } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import { Helmet } from 'react-helmet';
import { useForm } from 'react-hook-form';
import { useIntercom } from 'react-use-intercom';
import AnchorLink from '../components/common/AnchorLink';
import Page from '../components/common/Page/Page';
import {
    PasswordInputField,
    SubmitButton,
} from '../components/CreateUserForm/CreateUserForm.styles';
import { VerifyEmailForm } from '../components/CreateUserForm/VerifyEmailForm';
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
    LinkButton,
    Logo,
    LogoWrapper,
    Subtitle,
    Title,
} from './SignUp.styles';

const EmailVerification: FC = () => {
    const { health } = useApp();
    const { show: showIntercom } = useIntercom();

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
                    <VerifyEmailForm
                        numberOfAttempts={3}
                        expirationTime={'2023-03-02T11:11:00'}
                        onSubmit={() => {}}
                        onResend={() => {}}
                    />
                </CardWrapper>
                <FormFooterCopy>
                    You need to verify your email to get access to Lightdash. If
                    you need help, you can{' '}
                    <LinkButton onClick={() => showIntercom()}>
                        chat to support here.
                    </LinkButton>
                </FormFooterCopy>
            </FormWrapper>
        </Page>
    );
};

export default EmailVerification;
