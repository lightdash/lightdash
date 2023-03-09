import { Dialog, DialogBody } from '@blueprintjs/core';
import { Modal } from '@mantine/core';
import React, { FC, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useForm } from 'react-hook-form';
import { useIntercom } from 'react-use-intercom';
import Page from '../components/common/Page/Page';
import { LinkButton } from '../components/CreateUserForm/CreateUserForm.styles';
import { VerifyEmailForm } from '../components/CreateUserForm/VerifyEmailForm';
import PageSpinner from '../components/PageSpinner';
import {
    useEmailStatus,
    useOneTimePassword,
    useVerifyEmail,
} from '../hooks/useEmailVerification';
import { useApp } from '../providers/AppProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';
import {
    CardWrapper,
    FormFooterCopy,
    FormWrapper,
    Logo,
    LogoWrapper,
} from './SignUp.styles';

export const VerifyEmailPage: FC = () => {
    const { health, user } = useApp();
    const methods = useForm<{ code: string }>({ mode: 'onSubmit' });
    const { mutate, isLoading: verificationLoading } = useVerifyEmail();
    const { data, isLoading: statusLoading } = useEmailStatus();
    const { mutate: sendVerificationEmail, isLoading: emailLoading } =
        useOneTimePassword();
    const { show: showIntercom } = useIntercom();

    if (health.isLoading) {
        return <PageSpinner />;
    }

    return (
        <Page isFullHeight>
            <Helmet>
                <title>Verify your email - Lightdash</title>
            </Helmet>
            <LogoWrapper>
                <Logo src={LightdashLogo} alt="lightdash logo" />
            </LogoWrapper>
            <FormWrapper>
                <CardWrapper elevation={2}>
                    <VerifyEmailForm
                        email={user.data?.email || 'your e-mail.'}
                        methods={methods}
                        data={data}
                        expirationTime={data?.otp?.expiresAt || new Date()}
                        onSubmit={({ code }) => {
                            mutate(code);
                        }}
                        onResend={sendVerificationEmail}
                        isLoading={statusLoading || emailLoading}
                        verificationLoading={verificationLoading}
                    />
                </CardWrapper>
                <FormFooterCopy>
                    You need to verify your email to get access to Lightdash. If
                    you need help, you can
                    <LinkButton onClick={() => showIntercom()}>
                        chat to support here.
                    </LinkButton>
                </FormFooterCopy>
            </FormWrapper>
        </Page>
    );
};

export const VerifyEmailModal: FC<{
    opened: boolean;
    onClose: () => void;
    isLoading: boolean;
}> = ({ opened, onClose, isLoading }) => {
    const { health, user } = useApp();
    const methods = useForm<{ code: string }>({ mode: 'onSubmit' });
    const { mutate, isLoading: verificationLoading } = useVerifyEmail();
    const { data, isLoading: statusLoading } = useEmailStatus();
    const { mutate: sendVerificationEmail, isLoading: emailLoading } =
        useOneTimePassword();

    return (
        <Dialog isOpen={opened} onClose={onClose} title="">
            <DialogBody>
                <VerifyEmailForm
                    email={user.data?.email}
                    methods={methods}
                    data={data}
                    expirationTime={data?.otp?.expiresAt}
                    onSubmit={({ code }) => {
                        mutate(code);
                    }}
                    onResend={sendVerificationEmail}
                    isLoading={
                        statusLoading ||
                        emailLoading ||
                        health.isLoading ||
                        isLoading
                    }
                    verificationLoading={verificationLoading}
                />
            </DialogBody>
        </Dialog>
    );
};
