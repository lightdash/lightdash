import { Button, Classes, Tag } from '@blueprintjs/core';
import { ApiError, OpenIdIdentitySummary } from '@lightdash/common';
import React, { FC } from 'react';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../../api';
import { useDeleteOpenIdentityMutation } from '../../../hooks/user/useDeleteOpenIdentityMutation';
import {
    GoogleLoginButton,
    OktaLoginButton,
} from '../../common/GoogleLoginButton';
import {
    Bold,
    CardContainer,
    CardWrapper,
    GoogleButtonWrapper,
    Text,
    Title,
} from './SocialLoginsPanel.styles';

const getIdentitiesQuery = async () =>
    lightdashApi<OpenIdIdentitySummary[]>({
        url: '/user/identities',
        method: 'GET',
        body: undefined,
    });

const renderIssuerType = (
    issuerType: OpenIdIdentitySummary['issuerType'],
): string => {
    switch (issuerType) {
        case 'google':
            return 'Google';
        case 'okta':
            return 'Okta';
        default:
            return issuerType;
    }
};

const SocialLoginsPanel: FC = () => {
    const { data } = useQuery<OpenIdIdentitySummary[], ApiError>({
        queryKey: 'user_identities',
        queryFn: getIdentitiesQuery,
    });
    const deleteMutation = useDeleteOpenIdentityMutation();
    return (
        <div>
            <CardWrapper>
                {data?.map((id) => (
                    <CardContainer key={id.issuerType} elevation={0}>
                        <Text>
                            <Bold className={Classes.TEXT_OVERFLOW_ELLIPSIS}>
                                {renderIssuerType(id.issuerType)}
                            </Bold>
                            {id.email && <Tag minimal>{id.email}</Tag>}
                        </Text>
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
                    </CardContainer>
                ))}
            </CardWrapper>
            <Title>Add social login</Title>
            <GoogleButtonWrapper>
                <GoogleLoginButton />
            </GoogleButtonWrapper>
            <GoogleButtonWrapper>
                <OktaLoginButton />
            </GoogleButtonWrapper>
        </div>
    );
};

export default SocialLoginsPanel;
