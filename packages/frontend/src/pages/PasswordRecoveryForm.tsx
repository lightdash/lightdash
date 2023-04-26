import { Anchor, Center } from '@mantine/core';
import { FC } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import Form from '../components/ReactHookForm/Form';
import { usePasswordResetLinkMutation } from '../hooks/usePasswordReset';
import { useApp } from '../providers/AppProvider';
import {
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
                            intent="primary"
                            text="Send reset email"
                            loading={isLoading}
                        />
                        {!health.data?.isAuthenticated && (
                            <Center mt="lg">
                                <Anchor component={Link} to="/login">
                                    Back to sign in
                                </Anchor>
                            </Center>
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
                            <Anchor
                                component={Link}
                                to="/recover-password"
                                onClick={reset}
                            >
                                resubmitting a password reset
                            </Anchor>{' '}
                            request,
                            <br /> ensuring that there are no typos!
                        </ListItem>
                    </List>

                    <Center mt="lg">
                        <Anchor component={Link} to="/login">
                            Back to sign in
                        </Anchor>
                    </Center>
                </>
            )}
        </div>
    );
};
