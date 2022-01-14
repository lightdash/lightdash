import { ApiError, OpenIdIdentitySummary } from 'common';
import React from 'react';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';
import { GoogleLoginButton } from '../common/GoogleLoginButton';

const getIdentitiesQuery = async () =>
    lightdashApi<OpenIdIdentitySummary[]>({
        url: '/user/identities',
        method: 'GET',
        body: undefined,
    });

export const SocialLoginsPanel: React.FC = () => {
    const { data } = useQuery<OpenIdIdentitySummary[], ApiError>({
        queryKey: 'user_identities',
        queryFn: getIdentitiesQuery,
    });
    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <span>Identities</span>
            {data &&
                data.map((id) => (
                    <span>
                        {id.email} {id.issuer}
                    </span>
                ))}
            <GoogleLoginButton />
        </div>
    );
};
