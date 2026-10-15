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
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { z } from 'zod';
import { useAuthLayoutVariant } from '../components/common/AuthLayout/useAuthLayoutVariant';
import { usePasswordResetLinkMutation } from '../hooks/usePasswordReset';
import useApp from '../providers/App/useApp';

type RecoverPasswordForm = { email: string };

export const PasswordRecoveryForm: FC = () => {
    const { t } = useTranslation('auth');
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
                        {t('login.forgotPassword')}
                    </Title>
                    <Text ta={textAlign} mb="md" c="dimmed">
                        {t('passwordRecovery.description')}
                    </Text>
                    <form
                        name="password-recovery"
                        onSubmit={form.onSubmit((values) => mutate(values))}
                    >
                        <Stack gap="lg">
                            <TextInput
                                label={t('login.emailAddress')}
                                name="email"
                                type="email"
                                autoComplete="email"
                                placeholder={t('login.emailPlaceholderLegacy')}
                                required
                                {...form.getInputProps('email')}
                                disabled={isLoading || isSuccess}
                            />

                            <Button type="submit" loading={isLoading}>
                                {t('passwordRecovery.sendResetEmail')}
                            </Button>
                            {!health.data?.isAuthenticated && (
                                <Center>
                                    <Anchor
                                        inherit
                                        component={Link}
                                        to="/login"
                                    >
                                        {t('passwordRecovery.backToSignIn')}
                                    </Anchor>
                                </Center>
                            )}
                        </Stack>
                    </form>
                </>
            ) : (
                <>
                    <Title order={3} ta={textAlign} mb="sm">
                        {t('verifyEmail.checkInbox')}
                    </Title>
                    <Text ta={textAlign} mb="lg" c="dimmed">
                        {t('passwordRecovery.emailSent')}
                    </Text>

                    <List size="sm" spacing="xs">
                        <List.Item>{t('passwordRecovery.checkSpam')}</List.Item>
                        <List.Item>
                            <Trans
                                t={t}
                                i18nKey="passwordRecovery.resubmit"
                                components={{
                                    br: <br />,
                                    link: (
                                        <Anchor
                                            inherit
                                            component={Link}
                                            to="/recover-password"
                                            onClick={reset}
                                        />
                                    ),
                                }}
                            />
                        </List.Item>
                    </List>

                    <Center mt="lg">
                        <Anchor inherit component={Link} to="/login">
                            {t('passwordRecovery.backToSignIn')}
                        </Anchor>
                    </Center>
                </>
            )}
        </div>
    );
};
