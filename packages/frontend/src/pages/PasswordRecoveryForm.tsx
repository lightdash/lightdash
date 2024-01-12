import { getEmailSchema } from '@lightdash/common';
import {
    Anchor,
    Button,
    Center,
    List,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { FC } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { usePasswordResetLinkMutation } from '../hooks/usePasswordReset';
import { useApp } from '../providers/AppProvider';

type RecoverPasswordForm = { email: string };

export const PasswordRecoveryForm: FC = () => {
    const { health } = useApp();
    const form = useForm<RecoverPasswordForm>({
        initialValues: {
            email: '',
        },
        validate: zodResolver(
            z.object({
                email: getEmailSchema(),
            }),
        ),
    });

    const { isLoading, isSuccess, mutate, reset } =
        usePasswordResetLinkMutation();

    return (
        <div>
            {!isSuccess ? (
                <>
                    <Title order={3} ta="center" mb="sm">
                        Forgot your password?
                    </Title>
                    <Text ta="center" mb="md" color="dimmed">
                        Enter your email address and we’ll send you a password
                        reset link
                    </Text>
                    <form
                        name="password-recovery"
                        onSubmit={form.onSubmit((values) => mutate(values))}
                    >
                        <Stack spacing="lg">
                            <TextInput
                                label="Email address"
                                name="email"
                                placeholder="Your email address"
                                required
                                {...form.getInputProps('email')}
                                disabled={isLoading || isSuccess}
                            />

                            <Button type="submit" loading={isLoading}>
                                Send reset email
                            </Button>
                            {!health.data?.isAuthenticated && (
                                <Center>
                                    <Anchor component={Link} to="/login">
                                        Back to sign in
                                    </Anchor>
                                </Center>
                            )}
                        </Stack>
                    </form>
                </>
            ) : (
                <>
                    <Title order={3} ta="center" mb="sm">
                        Check your inbox!
                    </Title>
                    <Text ta="center" mb="lg" color="dimmed">
                        We have emailed you instructions about how to reset your
                        password. Haven’t received anything yet?
                    </Text>

                    <List size="sm" spacing="xs">
                        <List.Item>Try checking your spam folder</List.Item>
                        <List.Item>
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
                        </List.Item>
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
