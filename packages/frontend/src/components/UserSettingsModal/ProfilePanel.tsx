import React, { FC, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { ApiError, LightdashUser, UpdateUserArgs, validateEmail } from 'common';
import { Button, FormGroup, InputGroup, Intent } from '@blueprintjs/core';
import { useApp } from '../../providers/AppProvider';
import { lightdashApi } from '../../api';

const updateUserQuery = async (data: UpdateUserArgs) =>
    lightdashApi<LightdashUser>({
        url: `/user/me`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const ProfilePanel: FC = () => {
    const queryClient = useQueryClient();
    const { showError, showMessage, user } = useApp();
    const [firstName, setFirstName] = useState<string | undefined>(
        user.data?.firstName,
    );
    const [lastName, setLastName] = useState<string | undefined>(
        user.data?.lastName,
    );
    const [email, setEmail] = useState<string | undefined>(user.data?.email);

    const { isLoading, error, mutate } = useMutation<
        LightdashUser,
        ApiError,
        UpdateUserArgs
    >(updateUserQuery, {
        mutationKey: ['user_update'],
        onSuccess: (data) => {
            queryClient.setQueryData(['user'], data);
            showMessage({
                title: 'User updated with success',
            });
        },
    });

    useEffect(() => {
        if (error) {
            const [title, ...rest] = error.error.message.split('\n');
            showError({
                title,
                subtitle: rest.join('\n'),
            });
        }
    }, [error, showError]);

    const handleUpdate = () => {
        if (firstName && lastName && email && validateEmail(email)) {
            mutate({
                firstName,
                lastName,
                email,
            });
        } else {
            const title =
                email && !validateEmail(email)
                    ? 'Invalid email'
                    : 'Required fields: first name, last name and email';
            showError({
                title,
                timeout: 3000,
            });
        }
    };

    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <FormGroup
                label="First name"
                labelFor="first-name-input"
                labelInfo="(required)"
            >
                <InputGroup
                    id="first-name-input"
                    placeholder="Jane"
                    type="text"
                    required
                    disabled={isLoading}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                />
            </FormGroup>
            <FormGroup
                label="Last name"
                labelFor="last-name-input"
                labelInfo="(required)"
            >
                <InputGroup
                    id="last-name-input"
                    placeholder="Doe"
                    type="text"
                    required
                    disabled={isLoading}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                />
            </FormGroup>
            <FormGroup
                label="Email"
                labelFor="email-input"
                labelInfo="(required)"
            >
                <InputGroup
                    id="email-input"
                    placeholder="Email"
                    type="email"
                    required
                    disabled={isLoading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value.trim())}
                />
            </FormGroup>
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

export default ProfilePanel;
