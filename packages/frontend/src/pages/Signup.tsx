import { Card, H2, NonIdealState } from '@blueprintjs/core';
import {
    ApiError,
    CreateOrganizationUser,
    CreateUserArgs,
    LightdashUser,
} from 'common';
import React, { FC } from 'react';
import { useMutation } from 'react-query';
import { Redirect, useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { GoogleLoginButton } from '../components/common/GoogleLoginButton';
import Page from '../components/common/Page/Page';
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

    if (health.status === 'success' && health.data?.isAuthenticated) {
        return <Redirect to={{ pathname: '/' }} />;
    }

    return (
        <Page isFullHeight>
            <div
                style={{
                    width: '400px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    flex: 1,
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
                            {health.data?.auth.google.oauth2ClientId && (
                                <>
                                    <GoogleLoginButton
                                        inviteCode={inviteCode}
                                    />
                                    <span
                                        style={{
                                            textAlign: 'center',
                                            margin: 15,
                                        }}
                                    >
                                        <b>or</b>
                                    </span>
                                </>
                            )}
                            <CreateUserForm
                                isLoading={isLoading}
                                onSubmit={(data: CreateUserArgs) => {
                                    mutate({
                                        inviteCode,
                                        ...data,
                                    });
                                }}
                            />
                        </>
                    )}
                </Card>
            </div>
        </Page>
    );
};

export default Signup;
