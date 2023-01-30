import React, { FC } from 'react';
import { Redirect } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import { useApp } from '../providers/AppProvider';
import { PasswordRecoveryForm } from './PasswordRecoveryForm';
import { CardWrapper, FormWrapper, Logo, LogoWrapper } from './SignUp.styles';

const PasswordRecovery: FC = () => {
    const { health } = useApp();

    if (health.isLoading) {
        return <PageSpinner />;
    }

    if (health.status === 'success' && health.data?.isAuthenticated) {
        return <Redirect to={{ pathname: '/' }} />;
    }

    return (
        <Page isFullHeight>
            <FormWrapper>
                <LogoWrapper>
                    <Logo />
                </LogoWrapper>
                <CardWrapper elevation={2}>
                    <PasswordRecoveryForm />
                </CardWrapper>
            </FormWrapper>
        </Page>
    );
};

export default PasswordRecovery;
