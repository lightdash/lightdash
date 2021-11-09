import { Card, Colors, H2, NonIdealState } from '@blueprintjs/core';
import {
    ApiError,
    CreateInitialUserArgs,
    CreateOrganizationUser,
    LightdashUser,
} from 'common';
import React, { FC } from 'react';
import { useMutation } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import AboutFooter from '../components/AboutFooter';
import CreateUserForm from '../components/CreateUserForm';
import PageSpinner from '../components/PageSpinner';
import { useInviteLink } from '../hooks/useInviteLink';
import { useApp } from '../providers/AppProvider';
import { useTracking } from '../providers/TrackingProvider';

const createUserQuery = async (data: CreateOrganizationUser) =>
    lightdashApi<LightdashUser>({
        url: `/user`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const Signup: FC = () => {
    const { inviteCode } = useParams<{ inviteCode: string }>();
    const { health } = useApp();
    const { showToastError } = useApp();
    const { identify } = useTracking();
    const { isLoading, mutate } = useMutation<
        LightdashUser,
        ApiError,
        CreateOrganizationUser
    >(createUserQuery, {
        mutationKey: ['create_user'],
        onSuccess: (data) => {
            identify({ id: data.userUuid });
            window.location.href = '/';
        },
        onError: (error) => {
            showToastError({
                title: `Failed to create user`,
                subtitle: error.error.message,
            });
        },
    });
    const inviteLinkQuery = useInviteLink(inviteCode);

    if (health.isLoading || inviteLinkQuery.isLoading) {
        return <PageSpinner />;
    }

    return (
        <div
            style={{
                height: '100vh',
                display: 'grid',
                justifyContent: 'center',
                background: Colors.LIGHT_GRAY4,
            }}
        >
            <div
                style={{
                    width: '400px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                }}
            >
                <Card
                    style={{
                        padding: 25,
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                    elevation={2}
                >
                    {inviteLinkQuery.error ? (
                        <NonIdealState
                            title={inviteLinkQuery.error.error.message}
                            icon="error"
                        />
                    ) : (
                        <>
                            <H2 style={{ marginBottom: 25 }}>Create account</H2>
                            <CreateUserForm
                                includeOrganizationName={false}
                                isLoading={isLoading}
                                onCreate={(
                                    data: Omit<
                                        CreateInitialUserArgs,
                                        'organizationName'
                                    >,
                                ) => {
                                    mutate({
                                        inviteCode,
                                        ...data,
                                    });
                                }}
                            />
                        </>
                    )}
                </Card>
                <AboutFooter />
            </div>
        </div>
    );
};

export default Signup;
