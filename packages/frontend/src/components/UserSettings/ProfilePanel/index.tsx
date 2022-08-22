import { Button, FormGroup, InputGroup, Intent } from '@blueprintjs/core';
import {
    ApiError,
    LightdashUser,
    UpdateUserArgs,
    validateEmail,
} from '@lightdash/common';
import { FC, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { lightdashApi } from '../../../api';
import { useApp } from '../../../providers/AppProvider';

const updateUserQuery = async (data: Partial<UpdateUserArgs>) =>
    lightdashApi<LightdashUser>({
        url: `/user/me`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const ProfilePanel: FC = () => {
    const queryClient = useQueryClient();
    const {
        showToastError,
        errorLogs: { showError },
        showToastSuccess,
        user,
    } = useApp();
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
        Partial<UpdateUserArgs>
    >(updateUserQuery, {
        mutationKey: ['user_update'],
        onSuccess: async () => {
            await queryClient.refetchQueries('user');
            showToastSuccess({
                title: 'Success! User details were updated.',
            });
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
            showToastError({
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
                    placeholder="First name"
                    type="text"
                    required
                    disabled={isLoading}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    data-cy="first-name-input"
                />
            </FormGroup>
            <FormGroup
                label="Last name"
                labelFor="last-name-input"
                labelInfo="(required)"
            >
                <InputGroup
                    id="last-name-input"
                    placeholder="Last name"
                    type="text"
                    required
                    disabled={isLoading}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    data-cy="last-name-input"
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
                    data-cy="email-input"
                />
            </FormGroup>
            <div style={{ flex: 1 }} />
            <Button
                style={{ alignSelf: 'flex-end', marginTop: 20 }}
                intent={Intent.PRIMARY}
                text="Update"
                onClick={handleUpdate}
                loading={isLoading}
                data-cy="update-profile-settings"
            />
        </div>
    );
};

export default ProfilePanel;
