import {
    Button,
    Card,
    Colors,
    H2,
    Intent,
    NonIdealState,
} from '@blueprintjs/core';
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { Redirect, useParams } from 'react-router-dom';
import AnchorLink from '../components/common/AnchorLink/index';
import LinkButton from '../components/common/LinkButton';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import Form from '../components/ReactHookForm/Form';
import PasswordInput from '../components/ReactHookForm/PasswordInput';
import {
    usePasswordResetLink,
    usePasswordResetMutation,
} from '../hooks/usePasswordReset';
import { useApp } from '../providers/AppProvider';

type ResetPasswordForm = { password: string };

const PasswordReset: FC = () => {
    const { code } = useParams<{ code: string }>();
    const { health } = useApp();
    const { isLoading, isSuccess, error } = usePasswordResetLink(code);
    const resetMutation = usePasswordResetMutation();
    const methods = useForm<ResetPasswordForm>({
        mode: 'onSubmit',
    });

    const handleSubmit = (data: ResetPasswordForm) => {
        resetMutation.mutate({
            code,
            newPassword: data.password,
        });
    };

    if (health.isLoading || isLoading) {
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
                    {error ? (
                        <NonIdealState
                            title={error.error.message}
                            icon="error"
                        />
                    ) : (
                        <>
                            {!isSuccess ? (
                                <>
                                    <H2 style={{ marginBottom: 25 }}>
                                        Reset password
                                    </H2>
                                    <Form
                                        name="password_reset"
                                        methods={methods}
                                        onSubmit={handleSubmit}
                                    >
                                        <PasswordInput
                                            label="New password"
                                            name="password"
                                            placeholder="Enter your new password..."
                                            disabled={resetMutation.isLoading}
                                            rules={{
                                                required: 'Required field',
                                            }}
                                        />
                                        <div
                                            style={{
                                                marginTop: 20,
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                            }}
                                        >
                                            <AnchorLink href="/login">
                                                Cancel
                                            </AnchorLink>
                                            <Button
                                                type="submit"
                                                intent={Intent.PRIMARY}
                                                text="Save"
                                                loading={
                                                    resetMutation.isLoading
                                                }
                                            />
                                        </div>
                                    </Form>
                                </>
                            ) : (
                                <>
                                    <H2 style={{ marginBottom: 25 }}>
                                        Success! ✅
                                    </H2>
                                    <p
                                        style={{
                                            color: Colors.GRAY1,
                                            marginBottom: 20,
                                            lineHeight: 1.46,
                                        }}
                                    >
                                        Your password has been successfully
                                        updated. Use your new password to log
                                        in.
                                    </p>
                                    <div
                                        style={{
                                            marginTop: 20,
                                            display: 'flex',
                                            justifyContent: 'flex-end',
                                        }}
                                    >
                                        <LinkButton
                                            href="/login"
                                            intent={Intent.PRIMARY}
                                        >
                                            Log in
                                        </LinkButton>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </Card>
            </div>
        </Page>
    );
};

export default PasswordReset;
