import {
    Anchor,
    Box,
    Button,
    Card,
    Center,
    PasswordInput,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import LightdashLogo from '../components/LightdashLogo/LightdashLogo';
import PageSpinner from '../components/PageSpinner';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
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
        <Page title="Reset password" withCenteredContent withNavbar={false}>
            {/* FIXME: use Mantine sizes for width */}
            <Stack w={400} mt="4xl">
                <Box mx="auto" my="lg">
                    <LightdashLogo />
                </Box>
                <Card p="xl" radius="xs" withBorder shadow="xs">
                    {error ? (
                        <ErrorState error={error.error} hasMarginTop={false} />
                    ) : (
                        <>
                            {!passwordResetMutation.isSuccess ? (
                                <>
                                    <Title order={3} ta="center" mb="md">
                                        Reset your password
                                    </Title>
                                    <form
                                        name="password-reset"
                                        onSubmit={form.onSubmit(
                                            ({ password }) =>
                                                code &&
                                                passwordResetMutation.mutate({
                                                    code,
                                                    newPassword: password,
                                                }),
                                        )}
                                    >
                                        <Stack spacing="lg">
                                            <PasswordInput
                                                label="Password"
                                                name="password"
                                                placeholder="Enter a new password"
                                                disabled={
                                                    passwordResetMutation.isLoading
                                                }
                                                required
                                                {...form.getInputProps(
                                                    'password',
                                                )}
                                            />

                                            <Button
                                                type="submit"
                                                loading={
                                                    passwordResetMutation.isLoading
                                                }
                                            >
                                                Save
                                            </Button>

                                            <Center>
                                                <Anchor
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
                                    <Title order={3} ta="center" mb="md">
                                        Success!
                                    </Title>
                                    <Text ta="center" mb="lg" color="dimmed">
                                        Your password has been successfully
                                        updated.
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
                </Card>
            </Stack>
        </Page>
    );
};

export default PasswordReset;
