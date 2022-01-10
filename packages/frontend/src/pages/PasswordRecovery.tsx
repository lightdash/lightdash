import { Button, Card, Colors, H2, Intent } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { Redirect } from 'react-router-dom';
import LinkButton from '../components/common/LinkButton';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import Form from '../components/ReactHookForm/Form';
import Input from '../components/ReactHookForm/Input';
import { usePasswordResetLinkMutation } from '../hooks/usePasswordReset';
import { useApp } from '../providers/AppProvider';

type RecoverPasswordForm = { email: string };

const PasswordRecovery: FC = () => {
    const { health } = useApp();
    const { isLoading, isSuccess, mutate } = usePasswordResetLinkMutation();
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
                <Card
                    style={{
                        padding: 25,
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                    elevation={2}
                >
                    <H2>Reset password</H2>
                    <p style={{ color: Colors.GRAY1, marginBottom: 20 }}>
                        Enter your email to reset your password
                    </p>
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
                        <div
                            style={{
                                marginTop: 20,
                                display: 'flex',
                                justifyContent: 'flex-end',
                            }}
                        >
                            <LinkButton
                                href="/login"
                                minimal
                                style={{ marginRight: 10 }}
                            >
                                Cancel
                            </LinkButton>
                            <Button
                                type="submit"
                                intent={Intent.PRIMARY}
                                text={isSuccess ? 'Resend email' : 'Send email'}
                                loading={isLoading}
                            />
                        </div>
                    </Form>
                </Card>
            </div>
        </Page>
    );
};

export default PasswordRecovery;
