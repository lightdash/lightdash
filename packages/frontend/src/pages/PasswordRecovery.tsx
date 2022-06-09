import { Button, Card, Colors, H2, Intent } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { Redirect } from 'react-router-dom';
import styled from 'styled-components';
import AnchorLink from '../components/common/AnchorLink';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import Form from '../components/ReactHookForm/Form';
import Input from '../components/ReactHookForm/Input';
import { usePasswordResetLinkMutation } from '../hooks/usePasswordReset';
import { useApp } from '../providers/AppProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';
import { Logo, LogoWrapper } from './SignUp.styles';

type RecoverPasswordForm = { email: string };

const Text = styled.p`
    color: ${Colors.GRAY1};
    margin-bottom: 1.25em;
    line-height: 1.46;
`;

const List = styled.ul`
    margin: 0;
    padding-left: 1.5em;
    display: block;
`;

const ListItem = styled.li`
    margin: 0 0 0.3em;
    color: ${Colors.GRAY1};
    line-height: 1.5;
`;

const CtaWrapper = styled.div`
    margin-top: 2.5em;
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const PasswordRecovery: FC = () => {
    const { health } = useApp();
    const { isLoading, isSuccess, mutate, reset } =
        usePasswordResetLinkMutation();
    const methods = useForm<RecoverPasswordForm>({
        mode: 'onSubmit',
    });

    const handleSubmit = (data: RecoverPasswordForm) => {
        mutate(data);
    };

    if (health.isLoading) {
        return <PageSpinner />;
    }

    if (health.status === 'success' && health.data?.isAuthenticated) {
        return <Redirect to={{ pathname: '/' }} />;
    }

    return (
        <Page isFullHeight>
            <div
                style={{
                    width: '400px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    flex: 1,
                }}
            >
                <LogoWrapper>
                    <Logo src={LightdashLogo} alt="lightdash logo" />
                </LogoWrapper>
                <Card
                    style={{
                        padding: 25,
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                    elevation={2}
                >
                    {!isSuccess ? (
                        <>
                            <H2 style={{ marginBottom: 20 }}>
                                Forgot your password? 🙈
                            </H2>
                            <Text>
                                Enter your email address and we’ll send you a
                                password reset link
                            </Text>
                            <Form
                                name="password_recovery"
                                methods={methods}
                                onSubmit={handleSubmit}
                            >
                                <Input
                                    label="Account email"
                                    name="email"
                                    placeholder="Email"
                                    disabled={isLoading}
                                    rules={{
                                        required: 'Required field',
                                    }}
                                />
                                <CtaWrapper>
                                    <AnchorLink href="/login">
                                        Back to sign in
                                    </AnchorLink>
                                    <Button
                                        type="submit"
                                        intent={Intent.PRIMARY}
                                        text="Send reset email"
                                        loading={isLoading}
                                    />
                                </CtaWrapper>
                            </Form>
                        </>
                    ) : (
                        <>
                            <H2 style={{ marginBottom: 20 }}>
                                Check your inbox! ✅
                            </H2>
                            <Text style={{ marginBottom: 20 }}>
                                We have emailed you instructions about how to
                                reset your password.
                            </Text>
                            <Text style={{ fontWeight: 700 }}>
                                Haven’t received anything yet?
                            </Text>
                            <List>
                                <ListItem>
                                    Try checking your spam folder
                                </ListItem>
                                <ListItem>
                                    Try{' '}
                                    <AnchorLink
                                        href="/recover-password"
                                        onClick={reset}
                                    >
                                        resubmitting a password reset
                                    </AnchorLink>{' '}
                                    request, ensuring that there are no typos!
                                </ListItem>
                            </List>
                            <CtaWrapper
                                style={{
                                    justifyContent: 'center',
                                }}
                            >
                                <AnchorLink href="/login">
                                    Back to sign in
                                </AnchorLink>
                            </CtaWrapper>
                        </>
                    )}
                </Card>
            </div>
        </Page>
    );
};

export default PasswordRecovery;
