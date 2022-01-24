import { Button, Intent } from '@blueprintjs/core';
import { ApiError } from 'common';
import React, { FC, ReactNode, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from 'react-query';
import { lightdashApi } from '../../../api';
import { useApp } from '../../../providers/AppProvider';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';
import TagInput from '../../ReactHookForm/TagInput';

type DomainsProps = [] | string[] | ReactNode[];

const updateOrgQuery = async (data: {
    organizationName: string;
    allowedDomains?: DomainsProps;
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
    const organizationName = user.data?.organizationName;
    const allowedDomains = user.data?.allowedDomains || [];
    const methods = useForm({
        mode: 'onSubmit',
    });

    useEffect(() => {
        if (user.data) {
            methods.setValue('organizationName', organizationName);
            methods.setValue('allowedDomains', allowedDomains);
        }
    }, [user, methods]);

    const { isLoading, error, mutate } = useMutation<
        undefined,
        ApiError,
        {
            organizationName: string;
            allowedDomains: DomainsProps;
        }
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

    const handleUpdate = (data: {
        organizationName: string;
        allowedDomains: DomainsProps;
    }) => {
        mutate(data);
    };

    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <Form name="login" methods={methods} onSubmit={handleUpdate}>
                <Input
                    label="Organization name"
                    name="organizationName"
                    placeholder="Lightdash"
                    disabled={isLoading}
                    defaultValue={organizationName}
                    rules={{
                        required: 'Required field',
                    }}
                />

                <TagInput
                    label="Allowed email domains"
                    name="allowedDomains"
                    defaultValue={allowedDomains}
                />

                <div style={{ flex: 1 }} />
                <Button
                    style={{ alignSelf: 'flex-end', marginTop: 20 }}
                    intent={Intent.PRIMARY}
                    text="Update"
                    loading={isLoading}
                    type="submit"
                />
            </Form>
        </div>
    );
};

export default OrganizationPanel;
