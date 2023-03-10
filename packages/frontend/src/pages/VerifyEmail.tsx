import { Colors, Dialog, DialogBody, Intent } from '@blueprintjs/core';
import React, { FC } from 'react';
import { Helmet } from 'react-helmet';
import { useForm } from 'react-hook-form';
import { useHistory } from 'react-router-dom';
import { useIntercom } from 'react-use-intercom';
import Page from '../components/common/Page/Page';
import { LinkButton } from '../components/CreateUserForm/CreateUserForm.styles';
import { VerifyEmailForm } from '../components/CreateUserForm/VerifyEmailForm';
import { SaveButton } from '../components/Explorer/SaveChartButton/SaveChartButton.styles';
import PageSpinner from '../components/PageSpinner';
import {
    StyledSuccessIcon,
    Title,
} from '../components/ProjectConnection/ProjectConnectFlow/ProjectConnectFlow.styles';
import {
    useEmailStatus,
    useOneTimePassword,
    useVerifyEmail,
} from '../hooks/useEmailVerification';
import { useApp } from '../providers/AppProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';
import {
    CardWrapper,
    EmailVerifiedModal,
    EmailVerifiedWrapper,
    FormFooterCopy,
    FormWrapper,
    Logo,
    LogoWrapper,
} from './SignUp.styles';

export const VerificationSuccess: FC<{
    isOpen: boolean | undefined;
    onClose: () => void;
    onContinue: () => void;
}> = ({ isOpen, onClose, onContinue }) => {
    return (
        <EmailVerifiedModal isOpen={isOpen} onClose={onClose}>
            <EmailVerifiedWrapper>
                <Title>Great, you're verified! 🎉</Title>

                <StyledSuccessIcon
                    icon="tick-circle"
                    color={Colors.GREEN4}
                    size={64}
                />
                <SaveButton
                    intent={Intent.PRIMARY}
                    text="Continue"
                    onClick={onContinue}
                />
            </EmailVerifiedWrapper>
        </EmailVerifiedModal>
    );
};

export const VerifyEmailPage: FC = () => {
    const { health, user } = useApp();
    const methods = useForm<{ code: string }>({ mode: 'onSubmit' });
    const { mutate, isLoading: verificationLoading } = useVerifyEmail();
    const { data, isLoading: statusLoading } = useEmailStatus();
    const { mutate: sendVerificationEmail, isLoading: emailLoading } =
        useOneTimePassword();
    const { show: showIntercom } = useIntercom();
    const history = useHistory();

    if (health.isLoading || statusLoading) {
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
                <VerificationSuccess
                    isOpen={data?.isVerified}
                    onClose={() => {
                        history.push('/');
                    }}
                    onContinue={() => {
                        history.push('/');
                    }}
                />
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
