import { getPasswordSchema } from '@lightdash/common';
import { Button, PasswordInput, Stack } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { FC } from 'react';
import { z } from 'zod';
import {
    useUserHasPassword,
    useUserUpdatePasswordMutation,
} from '../../../hooks/user/usePassword';
import PasswordTextInput from '../../PasswordTextInput';

const passwordSchema = getPasswordSchema();

const validationSchema = z.object({
    currentPassword: passwordSchema,
    newPassword: passwordSchema,
});

const PasswordPanel: FC = () => {
    const { data: hasPassword } = useUserHasPassword();

    const form = useForm({
        initialValues: {
            currentPassword: '',
            newPassword: '',
        },
        validate: zodResolver(validationSchema),
    });

    const { isLoading, mutate: updateUserPassword } =
        useUserUpdatePasswordMutation();

    const handleOnSubmit = form.onSubmit(({ currentPassword, newPassword }) => {
        updateUserPassword({
            password: hasPassword ? currentPassword : '',
            newPassword,
        });
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
