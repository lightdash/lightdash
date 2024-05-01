import {
    Anchor,
    Button,
    Card,
    Center,
    Image,
    PasswordInput,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import { Link, useHistory, useParams } from 'react-router-dom';

import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import {
    usePasswordResetLink,
    usePasswordResetMutation,
} from '../hooks/usePasswordReset';
import { useApp } from '../providers/AppProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';

type ResetPasswordForm = { password: string };

const PasswordReset: FC = () => {
    const history = useHistory();
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
                <Image
                    src={
                        health.data?.siteLogoBlack
                            ? health.data?.siteLogoBlack
                            : LightdashLogo
                    }
                    alt={`${health.data?.siteName} logo`}
                    width={130}
                    mx="auto"
                    my="lg"
                />
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
                                        onClick={() => history.push('/login')}
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
