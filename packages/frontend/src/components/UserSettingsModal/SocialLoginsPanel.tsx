import { Button, Card, Classes, H4, Tag } from '@blueprintjs/core';
import { ApiError, OpenIdIdentitySummary } from 'common';
import React from 'react';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';
import { useDeleteOpenIdentityMutation } from '../../hooks/user/useDeleteOpenIdentityMutation';
import { GoogleLoginButton } from '../common/GoogleLoginButton';

const getIdentitiesQuery = async () =>
    lightdashApi<OpenIdIdentitySummary[]>({
        url: '/user/identities',
        method: 'GET',
        body: undefined,
    });

const renderIssuerUrl = (url: string): string => {
    switch (url) {
        case 'https://accounts.google.com':
            return 'Google';
        default:
            return 'unknown';
    }
};

export const SocialLoginsPanel: React.FC = () => {
    const { data } = useQuery<OpenIdIdentitySummary[], ApiError>({
        queryKey: 'user_identities',
        queryFn: getIdentitiesQuery,
    });
    const deleteMutation = useDeleteOpenIdentityMutation();
    return (
        <div>
            <div
                style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {data &&
                    data.map((id) => (
                        <Card
                            elevation={0}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                marginBottom: '20px',
                            }}
                        >
                            <p
                                style={{
                                    margin: 0,
                                    marginRight: '10px',
                                    flex: 1,
                                }}
                            >
                                <b
                                    className={Classes.TEXT_OVERFLOW_ELLIPSIS}
                                    style={{ margin: 0, marginRight: '10px' }}
                                >
                                    {renderIssuerUrl(id.issuer)}
                                </b>
                                {id.email && <Tag minimal>{id.email}</Tag>}
                            </p>
                            <Button
                                icon="delete"
                                disabled={deleteMutation.isLoading}
                                intent="danger"
                                text="Delete"
                                outlined
                                onClick={() =>
                                    deleteMutation.mutate({
                                        email: id.email,
                                        issuer: id.issuer,
                                    })
                                }
                            />
                        </Card>
                    ))}
            </div>
            <H4 style={{ marginBottom: 30 }}>Add social login</H4>
            <GoogleLoginButton />
        </div>
    );
};
