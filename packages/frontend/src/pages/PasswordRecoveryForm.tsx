import { getEmailSchema } from '@lightdash/common';
import {
    TextInput,
    Center,
    Stack,
    Text,
    Title,
    Button,
    Anchor,
    List,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { type FC } from 'react';
import { Link } from 'react-router';
import { z } from 'zod';
import { useAuthLayoutVariant } from '../components/common/AuthLayout/useAuthLayoutVariant';
import { usePasswordResetLinkMutation } from '../hooks/usePasswordReset';
import useApp from '../providers/App/useApp';

type RecoverPasswordForm = { email: string };

export const PasswordRecoveryForm: FC = () => {
    const { health } = useApp();
    const { isNewLayout } = useAuthLayoutVariant();
    const textAlign = isNewLayout ? 'left' : 'center';
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
                    <Title order={3} ta={textAlign} mb="sm">
                        Forgot your password?
                    </Title>
                    <Text ta={textAlign} mb="md" c="dimmed">
                        Enter your email address and we’ll send you a password
                        reset link
                    </Text>
                    <form
                        name="password-recovery"
                        onSubmit={form.onSubmit((values) => mutate(values))}
                    >
                        <Stack gap="lg">
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
                                    <Anchor
                                        inherit
                                        component={Link}
                                        to="/login"
                                    >
                                        Back to sign in
                                    </Anchor>
                                </Center>
                            )}
                        </Stack>
                    </form>
                </>
            ) : (
                <>
                    <Title order={3} ta={textAlign} mb="sm">
                        Check your inbox!
                    </Title>
                    <Text ta={textAlign} mb="lg" c="dimmed">
                        We have emailed you instructions about how to reset your
                        password. Haven’t received anything yet?
                    </Text>

                    <List size="sm" spacing="xs">
                        <List.Item>Try checking your spam folder</List.Item>
                        <List.Item>
                            Try{' '}
                            <Anchor
                                inherit
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
                        <Anchor inherit component={Link} to="/login">
                            Back to sign in
                        </Anchor>
                    </Center>
                </>
            )}
        </div>
    );
};
