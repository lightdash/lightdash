import {
    Center,
    Stack,
    Text,
    Title,
    Button,
    Anchor,
    PasswordInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import AuthLayout from '../components/common/AuthLayout';
import ErrorState from '../components/common/ErrorState';
import PageSpinner from '../components/PageSpinner';
import {
    usePasswordResetLink,
    usePasswordResetMutation,
} from '../hooks/usePasswordReset';
import useApp from '../providers/App/useApp';

type ResetPasswordForm = { password: string };

const PasswordReset: FC = () => {
    const navigate = useNavigate();
    const { code } = useParams<{ code: string }>();
    const { health } = useApp();
    const { isInitialLoading, error } = usePasswordResetLink(code);
    const passwordResetMutation = usePasswordResetMutation();

    const form = useForm<ResetPasswordForm>({
        initialValues: {
            password: '',
        },
    });

    if (health.isInitialLoading || isInitialLoading) {
        return <PageSpinner />;
    }

    return (
        <AuthLayout pageTitle="Reset password">
            {error ? (
                <ErrorState error={error.error} hasMarginTop={false} />
            ) : (
                <>
                    {!passwordResetMutation.isSuccess ? (
                        <>
                            <Title order={3} ta="left" mb="md">
                                Reset your password
                            </Title>
                            <form
                                name="password-reset"
                                onSubmit={form.onSubmit(({ password }) => {
                                    if (!code) return;
                                    passwordResetMutation.mutate({
                                        code,
                                        newPassword: password,
                                    });
                                })}
                            >
                                <Stack gap="lg">
                                    <PasswordInput
                                        label="Password"
                                        name="password"
                                        placeholder="Enter a new password"
                                        autoComplete="new-password"
                                        disabled={
                                            passwordResetMutation.isLoading
                                        }
                                        required
                                        {...form.getInputProps('password')}
                                    />

                                    <Button
                                        type="submit"
                                        loading={
                                            passwordResetMutation.isLoading
                                        }
                                        fullWidth
                                    >
                                        Save
                                    </Button>

                                    <Center>
                                        <Anchor
                                            inherit
                                            component={Link}
                                            to="/login"
                                        >
                                            Cancel
                                        </Anchor>
                                    </Center>
                                </Stack>
                            </form>
                        </>
                    ) : (
                        <>
                            <Title order={3} ta="left" mb="md">
                                Success!
                            </Title>
                            <Text ta="left" mb="lg" c="dimmed">
                                Your password has been successfully updated.
                                <br /> Use your new password to log in.
                            </Text>

                            <Button
                                fullWidth
                                onClick={() => navigate('/login')}
                            >
                                Log in
                            </Button>
                        </>
                    )}
                </>
            )}
        </AuthLayout>
    );
};

export default PasswordReset;
