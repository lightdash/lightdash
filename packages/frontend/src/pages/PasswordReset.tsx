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
import { Trans, useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import AuthLayout from '../components/common/AuthLayout';
import { useAuthLayoutVariant } from '../components/common/AuthLayout/useAuthLayoutVariant';
import ErrorState from '../components/common/ErrorState';
import PageSpinner from '../components/PageSpinner';
import {
    usePasswordResetLink,
    usePasswordResetMutation,
} from '../hooks/usePasswordReset';
import useApp from '../providers/App/useApp';

type ResetPasswordForm = { password: string };

const PasswordReset: FC = () => {
    const { t } = useTranslation('auth');
    const navigate = useNavigate();
    const { code } = useParams<{ code: string }>();
    const { health } = useApp();
    const { isInitialLoading, error } = usePasswordResetLink(code);
    const passwordResetMutation = usePasswordResetMutation();
    const { isNewLayout } = useAuthLayoutVariant();
    const textAlign = isNewLayout ? 'left' : 'center';

    const form = useForm<ResetPasswordForm>({
        initialValues: {
            password: '',
        },
    });

    if (health.isInitialLoading || isInitialLoading) {
        return <PageSpinner />;
    }

    return (
        <AuthLayout pageTitle={t('passwordReset.pageTitle')}>
            {error ? (
                <ErrorState error={error.error} hasMarginTop={false} />
            ) : (
                <>
                    {!passwordResetMutation.isSuccess ? (
                        <>
                            <Title order={3} ta={textAlign} mb="md">
                                {t('passwordReset.title')}
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
                                        label={t('login.password')}
                                        name="password"
                                        placeholder={t(
                                            'passwordReset.newPasswordPlaceholder',
                                        )}
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
                                        fullWidth={isNewLayout}
                                    >
                                        {t('actions.save', { ns: 'common' })}
                                    </Button>

                                    <Center>
                                        <Anchor
                                            inherit
                                            component={Link}
                                            to="/login"
                                        >
                                            {t('actions.cancel', {
                                                ns: 'common',
                                            })}
                                        </Anchor>
                                    </Center>
                                </Stack>
                            </form>
                        </>
                    ) : (
                        <>
                            <Title order={3} ta={textAlign} mb="md">
                                {t('passwordReset.successTitle')}
                            </Title>
                            <Text ta={textAlign} mb="lg" c="dimmed">
                                <Trans
                                    t={t}
                                    i18nKey="passwordReset.successMessage"
                                    components={{ br: <br /> }}
                                />
                            </Text>

                            <Button
                                fullWidth
                                onClick={() => navigate('/login')}
                            >
                                {t('login.title')}
                            </Button>
                        </>
                    )}
                </>
            )}
        </AuthLayout>
    );
};

export default PasswordReset;
