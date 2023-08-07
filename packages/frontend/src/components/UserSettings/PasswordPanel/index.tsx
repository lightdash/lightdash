import { PasswordValidationResult, validatePassword } from '@lightdash/common';
import { Button, PasswordInput, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { FC, useState } from 'react';
import {
    useUserHasPassword,
    useUserUpdatePasswordMutation,
} from '../../../hooks/user/usePassword';
import PasswordValidationMessages from '../../common/PasswordValidationMessages';

const PasswordPanel: FC = () => {
    const [validationResult, setValidationResult] =
        useState<PasswordValidationResult>({
            isLengthValid: false,
            hasLetter: false,
            hasNumberOrSymbol: false,
            isPasswordValid: false,
        });
    const { data: hasPassword } = useUserHasPassword();

    const form = useForm({
        initialValues: {
            currentPassword: '',
            newPassword: '',
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
                <PasswordInput
                    label="New password"
                    placeholder="Enter your new password..."
                    required
                    disabled={isLoading}
                    {...form.getInputProps('newPassword')}
                    onChange={(event) => {
                        setValidationResult(
                            validatePassword(event.currentTarget.value),
                        );
                        form.getInputProps('newPassword').onChange(event);
                    }}
                />
                <PasswordValidationMessages {...validationResult} />
                <Button
                    type="submit"
                    ml="auto"
                    display="block"
                    loading={isLoading}
                    disabled={!validationResult.isPasswordValid || isLoading}
                >
                    Update
                </Button>
            </Stack>
        </form>
    );
};

export default PasswordPanel;
