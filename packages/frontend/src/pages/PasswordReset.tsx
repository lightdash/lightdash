import { Intent, NonIdealState } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { Redirect, useHistory, useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import Form from '../components/ReactHookForm/Form';
import {
    usePasswordResetLink,
    usePasswordResetMutation,
} from '../hooks/usePasswordReset';
import { useApp } from '../providers/AppProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';
import {
    CardWrapper,
    FormLink,
    FormWrapper,
    Logo,
    LogoWrapper,
    PasswordInputField,
    SubmitButton,
    Subtitle,
    Title,
} from './PasswordRecovery.styles';

type ResetPasswordForm = { password: string };

const PasswordReset: FC = () => {
    const { code } = useParams<{ code: string }>();
    const history = useHistory();
    const { health } = useApp();
    const { isLoading, error } = usePasswordResetLink(code);
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
            <FormWrapper>
                <LogoWrapper>
                    <Logo src={LightdashLogo} alt="lightdash logo" />
                </LogoWrapper>
                <CardWrapper elevation={2}>
                    {error ? (
                        <NonIdealState
                            title={error.error.message}
                            icon="error"
                        />
                    ) : (
                        <>
                            {!resetMutation.isSuccess ? (
                                <>
                                    <Title>Reset your password</Title>
                                    <Form
                                        name="password_reset"
                                        methods={methods}
                                        onSubmit={handleSubmit}
                                    >
                                        <PasswordInputField
                                            label="Password"
                                            name="password"
                                            placeholder="Enter a new password"
                                            disabled={resetMutation.isLoading}
                                            rules={{
                                                required: 'Required field',
                                            }}
                                        />

                                        <SubmitButton
                                            type="submit"
                                            intent={Intent.PRIMARY}
                                            text="Save"
                                            loading={resetMutation.isLoading}
                                        />
                                        <FormLink href="/login">
                                            Cancel
                                        </FormLink>
                                    </Form>
                                </>
                            ) : (
                                <>
                                    <Title>Success! ✅</Title>
                                    <Subtitle>
                                        Your password has been successfully
                                        updated.
                                        <br /> Use your new password to sign in.
                                    </Subtitle>
                                    <SubmitButton
                                        onClick={() => history.push('/login')}
                                        text="Log in"
                                        intent={Intent.PRIMARY}
                                    />
                                </>
                            )}
                        </>
                    )}
                </CardWrapper>
            </FormWrapper>
        </Page>
    );
};

export default PasswordReset;
