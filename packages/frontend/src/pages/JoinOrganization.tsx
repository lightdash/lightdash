import { Button } from '@blueprintjs/core';
import { LightdashMode } from '@lightdash/common';
import React, { FC, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useHistory } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import { useOrganisationCreateMutation } from '../hooks/organisation/useOrganisationCreateMutation';
import useAllowedOrganizations from '../hooks/user/useAllowedOrganizations';
import { useJoinOrganizationMutation } from '../hooks/user/useJoinOrganizationMutation';
import { useApp } from '../providers/AppProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';
import { CardWrapper, FormWrapper, Logo, LogoWrapper } from './SignUp.styles';

export const JoinOrganizationPage: FC = () => {
    const { health } = useApp();
    const history = useHistory();
    const { isLoading: isLoadingAllowedOrgs, data: allowedOrgs } =
        useAllowedOrganizations();
    const {
        mutate: createOrg,
        isLoading: isCreatingOrg,
        isSuccess: hasCreatedOrg,
    } = useOrganisationCreateMutation();
    const {
        mutate: joinOrg,
        isLoading: isJoiningOrg,
        isSuccess: hasJoinedOrg,
    } = useJoinOrganizationMutation();

    useEffect(() => {
        const isPR = health.data?.mode === LightdashMode.PR;
        const isAllowedToJoinOrgs = allowedOrgs && allowedOrgs.length > 0;
        if (isPR || !isAllowedToJoinOrgs) {
            createOrg({ name: '' });
        }
    }, [health, allowedOrgs, createOrg]);

    useEffect(() => {
        if (hasCreatedOrg || hasJoinedOrg) {
            history.push('/');
        }
    }, [hasCreatedOrg, hasJoinedOrg]);

    if (health.isLoading || isLoadingAllowedOrgs || isCreatingOrg) {
        return <PageSpinner />;
    }

    return (
        <Page isFullHeight>
            <Helmet>
                <title>Join a workspace - Lightdash</title>
            </Helmet>
            <LogoWrapper>
                <Logo src={LightdashLogo} alt="lightdash logo" />
            </LogoWrapper>
            <FormWrapper>
                <CardWrapper elevation={2}>
                    {allowedOrgs?.map((org) => (
                        <p key={org.organizationUuid}>
                            {org.name} {org.organizationUuid} {org.membersCount}{' '}
                            <Button
                                disabled={isJoiningOrg}
                                onClick={() => joinOrg(org.organizationUuid)}
                            >
                                Join
                            </Button>
                        </p>
                    ))}
                    <Button
                        disabled={isCreatingOrg}
                        onClick={() => createOrg({ name: '' })}
                    >
                        Create a new one
                    </Button>
                </CardWrapper>
            </FormWrapper>
        </Page>
    );
};
