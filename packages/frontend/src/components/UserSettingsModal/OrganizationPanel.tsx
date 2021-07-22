import React, { FC, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { ApiError } from 'common';
import { Button, FormGroup, InputGroup, Intent } from '@blueprintjs/core';
import { useApp } from '../../providers/AppProvider';
import { lightdashApi } from '../../api';

const updateOrgQuery = async (data: { organizationName: string }) =>
    lightdashApi<undefined>({
        url: `/org`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const OrganizationPanel: FC = () => {
    const queryClient = useQueryClient();
    const { showError, showMessage, user } = useApp();
    const [organizationName, setOrganizationName] = useState<
        string | undefined
    >(user.data?.organizationName);

    const { isLoading, error, mutate } = useMutation<
        undefined,
        ApiError,
        { organizationName: string }
    >(updateOrgQuery, {
        mutationKey: ['user_update'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['user']);
            showMessage({
                title: 'Organization name updated with success',
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
        if (organizationName) {
            mutate({
                organizationName,
            });
        } else {
            showError({
                title: 'Required fields: organization name',
                timeout: 3000,
            });
        }
    };

    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <FormGroup
                label="Organization name"
                labelFor="organization-name-input"
                labelInfo="(required)"
            >
                <InputGroup
                    id="organization-name-input"
                    placeholder="Lightdash"
                    type="text"
                    required
                    disabled={isLoading}
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
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

export default OrganizationPanel;
