import { getPasswordSchema } from '@lightdash/common';
import { Button, Flex, PasswordInput, Stack } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { type FC } from 'react';
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
    const { showToastSuccess, showToastApiError } = useToaster();

    const form = useForm({
        initialValues: {
            currentPassword: '',
            newPassword: '',
        },
        validate: zodResolver(validationSchema(!!hasPassword)),
    });

    const { isLoading: isUpdatingUserPassword, mutate: updateUserPassword } =
        useUserUpdatePasswordMutation({
            onSuccess: () => {
                showToastSuccess({
                    title: 'Your password has been updated',
                });

                window.location.href = '/login';
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to update password',
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
                        label="Current password"
                        placeholder="Enter your password..."
                        disabled={isUpdatingUserPassword}
                        {...form.getInputProps('currentPassword')}
                    />
                )}
                <PasswordTextInput passwordValue={form.values.newPassword}>
                    <PasswordInput
                        label="New password"
                        placeholder="Enter your new password..."
                        disabled={isUpdatingUserPassword}
                        {...form.getInputProps('newPassword')}
                    />
                </PasswordTextInput>

                <Flex justify="flex-end" gap="sm">
                    {form.isDirty() && !isUpdatingUserPassword && (
                        <Button variant="outline" onClick={() => form.reset()}>
                            Cancel
                        </Button>
                    )}

                    <Button
                        type="submit"
                        display="block"
                        loading={isUpdatingUserPassword}
                        disabled={isUpdatingUserPassword}
                    >
                        Update
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
};

export default PasswordPanel;
