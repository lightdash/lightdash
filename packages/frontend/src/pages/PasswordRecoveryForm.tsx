import { Intent } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import AnchorLink from '../components/common/AnchorLink';
import Form from '../components/ReactHookForm/Form';
import { usePasswordResetLinkMutation } from '../hooks/usePasswordReset';
import { useApp } from '../providers/AppProvider';
import {
    FormLink,
    InputField,
    List,
    ListItem,
    SubmitButton,
    Subtitle,
    Title,
} from './PasswordRecovery.styles';

type RecoverPasswordForm = { email: string };

export const PasswordRecoveryForm: FC = () => {
    const { health } = useApp();

    const { isLoading, isSuccess, mutate, reset } =
        usePasswordResetLinkMutation();
    const methods = useForm<RecoverPasswordForm>({
        mode: 'onSubmit',
    });

    const handleSubmit = (data: RecoverPasswordForm) => {
        mutate(data);
    };

    return (
        <div>
            {!isSuccess ? (
                <>
                    <Title>Forgot your password? 🙈</Title>
                    <Subtitle>
                        Enter your email address and we’ll send you a password
                        reset link
                    </Subtitle>
                    <Form
                        name="password_recovery"
                        methods={methods}
                        onSubmit={handleSubmit}
                    >
                        <InputField
                            label="E-mail address"
                            name="email"
                            placeholder="Your email address"
                            disabled={isLoading}
                            rules={{
                                required: 'Required field',
                            }}
                        />

                        <SubmitButton
                            type="submit"
                            intent={Intent.PRIMARY}
                            text="Send reset email"
                            loading={isLoading}
                        />
                        {!health.data?.isAuthenticated && (
                            <FormLink href="/login">Back to sign in</FormLink>
                        )}
                    </Form>
                </>
            ) : (
                <>
                    <Title>Check your inbox! ✅</Title>
                    <Subtitle>
                        We have emailed you instructions about how to reset your
                        password. Haven’t received anything yet?
                    </Subtitle>

                    <List>
                        <ListItem>Try checking your spam folder</ListItem>
                        <ListItem>
                            Try{' '}
                            <AnchorLink
                                href="/recover-password"
                                onClick={reset}
                            >
                                resubmitting a password reset
                            </AnchorLink>{' '}
                            request,
                            <br /> ensuring that there are no typos!
                        </ListItem>
                    </List>
                    <FormLink href="/login">Back to sign in</FormLink>
                </>
            )}
        </div>
    );
};
