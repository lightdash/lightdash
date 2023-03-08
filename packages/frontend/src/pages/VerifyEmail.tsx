import { Dialog, DialogBody } from '@blueprintjs/core';
import { Modal } from '@mantine/core';
import React, { FC, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useForm } from 'react-hook-form';
import Page from '../components/common/Page/Page';
import { VerifyEmailForm } from '../components/CreateUserForm/VerifyEmailForm';
import PageSpinner from '../components/PageSpinner';
import {
    useEmailStatus,
    useOneTimePassword,
    useVerifyEmail,
} from '../hooks/useEmailVerification';
import { useApp } from '../providers/AppProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';
import { CardWrapper, FormWrapper, Logo, LogoWrapper } from './SignUp.styles';

export const VerifyEmailPage: FC = () => {
    const { health, user } = useApp();
    const methods = useForm<{ code: string }>({ mode: 'onSubmit' });
    const { mutate } = useVerifyEmail();
    const { data } = useEmailStatus();
    const { mutate: sendVerificationEmail } = useOneTimePassword();

    if (health.isLoading && data) {
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
                    />
                </CardWrapper>
            </FormWrapper>
        </Page>
    );
};

export const VerifyEmailModal: FC<{ opened: boolean; onClose: () => void }> = ({
    opened,
    onClose,
}) => {
    const { health, user } = useApp();
    const methods = useForm<{ code: string }>({ mode: 'onSubmit' });
    const { mutate } = useVerifyEmail();
    const { data } = useEmailStatus();
    const { mutate: sendVerificationEmail } = useOneTimePassword();

    if (health.isLoading && !data) {
        return <PageSpinner />;
    }

    return (
        <Dialog isOpen={opened} onClose={onClose} title="">
            <DialogBody>
                <VerifyEmailForm
                    email={user.data?.email || 'your e-mail.'}
                    methods={methods}
                    data={data}
                    expirationTime={data?.otp?.expiresAt || new Date()}
                    onSubmit={({ code }) => {
                        mutate(code);
                    }}
                    onResend={sendVerificationEmail}
                />
            </DialogBody>
        </Dialog>
    );
};
