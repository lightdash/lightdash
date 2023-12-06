import { getPasswordSchema } from '@lightdash/common';
import { Button, PasswordInput, Stack } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { FC } from 'react';
import { z } from 'zod';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useUserHasPassword,
    useUserUpdatePasswordMutation,
} from '../../../hooks/user/usePassword';
import PasswordTextInput from '../../PasswordTextInput';

const passwordSchema = getPasswordSchema();

const validationSchema = (hasCurrentPassword: boolean) => {
    return hasCurrentPassword
        ? z.object({
              // we check validity of current password on the server
              currentPassword: z.string().nonempty(),
              newPassword: passwordSchema,
          })
        : z.object({
              newPassword: passwordSchema,
          });
};

const PasswordPanel: FC = () => {
    const { data: hasPassword } = useUserHasPassword();
    const { showToastSuccess, showToastError } = useToaster();

    const form = useForm({
        initialValues: {
            currentPassword: '',
            newPassword: '',
        },
        validate: zodResolver(validationSchema(!!hasPassword)),
    });

    const { isLoading, mutate: updateUserPassword } =
        useUserUpdatePasswordMutation({
            onSuccess: () => {
                showToastSuccess({
                    title: 'Your password has been updated',
                });

                window.location.href = '/login';
            },
            onError: ({ error }) => {
                showToastError({
                    title: 'Failed to update password',
                    subtitle: error.message,
                });
            },
        });

    const handleOnSubmit = form.onSubmit(({ currentPassword, newPassword }) => {
        if (hasPassword) {
            updateUserPassword({
                password: currentPassword,
                newPassword,
            });
        } else {
            updateUserPassword({
                newPassword,
            });
        }
    });

    return (
        <form onSubmit={handleOnSubmit}>
            <Stack mt="md">
                {hasPassword && (
                    <PasswordInput
                        label="Current password"
                        placeholder="Enter your password..."
                        disabled={isLoading}
                        {...form.getInputProps('currentPassword')}
                    />
                )}
                <PasswordTextInput passwordValue={form.values.newPassword}>
                    <PasswordInput
                        label="New password"
                        placeholder="Enter your new password..."
                        disabled={isLoading}
                        {...form.getInputProps('newPassword')}
                    />
                </PasswordTextInput>
                <Button
                    type="submit"
                    ml="auto"
                    display="block"
                    loading={isLoading}
                    disabled={isLoading}
                >
                    Update
                </Button>
            </Stack>
        </form>
    );
};

export default PasswordPanel;
