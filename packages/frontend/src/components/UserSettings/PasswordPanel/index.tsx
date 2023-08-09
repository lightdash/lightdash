import { passwordSchema } from '@lightdash/common';
import { Button, PasswordInput, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { FC } from 'react';
import {
    useUserHasPassword,
    useUserUpdatePasswordMutation,
} from '../../../hooks/user/usePassword';
import PasswordTextInput from '../../PasswordTextInput';

const PasswordPanel: FC = () => {
    const { data: hasPassword } = useUserHasPassword();

    const form = useForm({
        initialValues: {
            currentPassword: '',
            newPassword: '',
        },
        validate: {
            newPassword: (value) => {
                const result = passwordSchema.safeParse(value);
                if (result.success) {
                    return null;
                }
                return result.error.issues.map((issue) => issue.message);
            },
        },
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
                        required
                        disabled={isLoading}
                        {...form.getInputProps('currentPassword')}
                    />
                )}
                <PasswordTextInput passwordValue={form.values.newPassword}>
                    <PasswordInput
                        label="New password"
                        placeholder="Enter your new password..."
                        required
                        disabled={isLoading}
                        {...form.getInputProps('newPassword')}
                        onChange={(event) => {
                            form.getInputProps('newPassword').onChange(event);
                        }}
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
