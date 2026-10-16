import { getPasswordSchema } from '@lightdash/common';
import { Button, Flex, PasswordInput, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { type TFunction } from 'i18next';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useUserHasPassword,
    useUserUpdatePasswordMutation,
} from '../../../hooks/user/usePassword';
import PasswordTextInput from '../../PasswordTextInput';

const passwordSchema = getPasswordSchema();

const validationSchema = (hasCurrentPassword: boolean, t: TFunction) => {
    return hasCurrentPassword
        ? z.object({
              // we check validity of current password on the server
              currentPassword: z
                  .string()
                  .min(
                      1,
                      t('passwordPanel.validation.currentPasswordRequired'),
                  ),
              newPassword: passwordSchema,
          })
        : z.object({
              newPassword: passwordSchema,
          });
};

const PasswordPanel: FC = () => {
    const { t } = useTranslation('userSettings');
    const { data: hasPassword } = useUserHasPassword();
    const { showToastSuccess, showToastApiError } = useToaster();

    const form = useForm({
        initialValues: {
            currentPassword: '',
            newPassword: '',
        },
        validate: zodResolver(validationSchema(!!hasPassword, t)),
    });

    const { isLoading: isUpdatingUserPassword, mutate: updateUserPassword } =
        useUserUpdatePasswordMutation({
            onSuccess: () => {
                showToastSuccess({
                    title: t('passwordPanel.toasts.updateSuccess'),
                });

                window.location.href = '/login';
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('passwordPanel.toasts.updateFailed'),
                    apiError: error,
                });
            },
        });

    const handleOnSubmit = form.onSubmit(({ currentPassword, newPassword }) => {
        if (!form.isValid()) return;

        if (hasPassword) {
            updateUserPassword({ password: currentPassword, newPassword });
        } else {
            updateUserPassword({ newPassword });
        }
    });

    return (
        <form onSubmit={handleOnSubmit}>
            <Stack mt="md">
                {hasPassword && (
                    <PasswordInput
                        label={t('passwordPanel.currentPassword.label')}
                        placeholder={t(
                            'passwordPanel.currentPassword.placeholder',
                        )}
                        disabled={isUpdatingUserPassword}
                        {...form.getInputProps('currentPassword')}
                    />
                )}
                <PasswordTextInput passwordValue={form.values.newPassword}>
                    <PasswordInput
                        label={t('passwordPanel.newPassword.label')}
                        placeholder={t('passwordPanel.newPassword.placeholder')}
                        disabled={isUpdatingUserPassword}
                        {...form.getInputProps('newPassword')}
                    />
                </PasswordTextInput>

                <Flex justify="flex-end" gap="sm">
                    {form.isDirty() && !isUpdatingUserPassword && (
                        <Button variant="outline" onClick={() => form.reset()}>
                            {t('actions.cancel', { ns: 'common' })}
                        </Button>
                    )}

                    <Button
                        type="submit"
                        loading={isUpdatingUserPassword}
                        disabled={isUpdatingUserPassword}
                    >
                        {t('actions.update', { ns: 'common' })}
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
};

export default PasswordPanel;
