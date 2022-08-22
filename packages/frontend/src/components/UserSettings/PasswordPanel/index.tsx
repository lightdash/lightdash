import { Button, Intent } from '@blueprintjs/core';
import { ApiError } from '@lightdash/common';
import { FC, useEffect, useState } from 'react';
import { useMutation } from 'react-query';
import { lightdashApi } from '../../../api';
import { useApp } from '../../../providers/AppProvider';
import PasswordInput from '../../PasswordInput';

const updateUserPasswordQuery = async (data: {
    password: string;
    newPassword: string;
}) =>
    lightdashApi<undefined>({
        url: `/user/password`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const PasswordPanel: FC = () => {
    const {
        errorLogs: { showError },
        showToastError,
    } = useApp();
    const [password, setPassword] = useState<string>();
    const [newPassword, setNewPassword] = useState<string>();

    const { isLoading, error, mutate } = useMutation<
        undefined,
        ApiError,
        { password: string; newPassword: string }
    >(updateUserPasswordQuery, {
        mutationKey: ['user_password_update'],
        onSuccess: () => {
            window.location.href = '/login';
        },
    });

    useEffect(() => {
        if (error) {
            const [title, ...rest] = error.error.message.split('\n');
            showError({
                title,
                body: rest.join('\n'),
            });
        }
    }, [error, showError]);

    const handleUpdate = () => {
        if (password && newPassword) {
            mutate({
                password,
                newPassword,
            });
        } else {
            showToastError({
                title: 'Required fields: password and new password',
                timeout: 3000,
            });
        }
    };

    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <PasswordInput
                label="Current password"
                placeholder="Enter your password..."
                required
                disabled={isLoading}
                value={password}
                onChange={setPassword}
            />
            <PasswordInput
                label="New password"
                placeholder="Enter your new password..."
                required
                disabled={isLoading}
                value={newPassword}
                onChange={setNewPassword}
            />
            <div style={{ flex: 1 }} />
            <Button
                style={{ alignSelf: 'flex-end', marginTop: 20 }}
                intent={Intent.PRIMARY}
                text="Update"
                onClick={handleUpdate}
                loading={isLoading}
            />
        </div>
    );
};

export default PasswordPanel;
