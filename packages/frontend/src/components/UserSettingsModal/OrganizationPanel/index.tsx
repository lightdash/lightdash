import {
    Button,
    FormGroup,
    InputGroup,
    Intent,
    TagInput,
} from '@blueprintjs/core';
import { ApiError } from 'common';
import React, { FC, ReactNode, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { lightdashApi } from '../../../api';
import { useApp } from '../../../providers/AppProvider';

const updateOrgQuery = async (data: {
    organizationName?: string;
    allowedDomains?: string[];
}) =>
    lightdashApi<undefined>({
        url: `/org`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const OrganizationPanel: FC = () => {
    const queryClient = useQueryClient();
    const {
        errorLogs: { showError },
        showToastError,
        showToastSuccess,
        user,
    } = useApp();
    const [allowedDomains, setAllowedDomains] = useState<
        string[] | ReactNode[] | undefined
    >(user.data?.allowedDomains);
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
            showToastSuccess({
                title: 'Success! Organization name was updated',
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
        if (organizationName) {
            mutate({
                organizationName,
            });
        } else {
            showToastError({
                title: 'Required fields: organization name',
                timeout: 3000,
            });
        }

        if (allowedDomains) {
            mutate({
                allowedDomains,
            });
        } else {
            showToastError({
                title: 'Required fields: allowed email domains',
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
            <FormGroup label="Allowed email domains" labelInfo="(required)">
                <TagInput
                    addOnBlur
                    addOnPaste
                    onChange={(e: string[] | ReactNode[]) =>
                        setAllowedDomains(e)
                    }
                    values={allowedDomains}
                    placeholder="Allowed domains"
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
