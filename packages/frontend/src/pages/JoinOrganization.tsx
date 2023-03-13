import { Card, Colors } from '@blueprintjs/core';
import { LightdashMode } from '@lightdash/common';
import { Avatar, Box, Text } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import React, { FC, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useHistory } from 'react-router-dom';
import { BigButton } from '../components/common/BigButton';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import { useOrganisationCreateMutation } from '../hooks/organisation/useOrganisationCreateMutation';
import useAllowedOrganizations from '../hooks/user/useAllowedOrganizations';
import { useJoinOrganizationMutation } from '../hooks/user/useJoinOrganizationMutation';
import { useApp } from '../providers/AppProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';
import {
    CardWrapper,
    FormWrapper,
    Logo,
    LogoWrapper,
    Subtitle,
    Title,
} from './SignUp.styles';

export const JoinOrganizationPage: FC = () => {
    const { health, user } = useApp();
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
        const userHasOrg = user.data && !!user.data.organizationUuid;
        if (
            !isCreatingOrg &&
            !isLoadingAllowedOrgs &&
            !userHasOrg &&
            (isPR || !isAllowedToJoinOrgs)
        ) {
            createOrg({ name: '' });
        }
    }, [
        health,
        allowedOrgs,
        createOrg,
        isCreatingOrg,
        user,
        isLoadingAllowedOrgs,
    ]);

    useEffect(() => {
        if (hasCreatedOrg || hasJoinedOrg) {
            history.push('/');
        }
    }, [hasCreatedOrg, hasJoinedOrg]);

    if (health.isLoading || isLoadingAllowedOrgs || isCreatingOrg) {
        return <PageSpinner />;
    }

    const disabled = isCreatingOrg || isJoiningOrg;

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
                    <Title>Join a workspace</Title>
                    <Subtitle>
                        The workspaces below are open to anyone with a{' '}
                        <b>@{(user.data?.email || '').split('@')[1]}</b> domain.
                        Select a workspace to join, or create a new one!
                    </Subtitle>
                    {allowedOrgs?.map((org) => (
                        <Card
                            key={org.organizationUuid}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                marginBottom: 22,
                                padding: 10,
                            }}
                            interactive
                            elevation={0}
                            onClick={() => joinOrg(org.organizationUuid)}
                        >
                            <Avatar size="md" radius="xl" color={'gray'}>
                                {org.name[0]?.toUpperCase()}
                            </Avatar>
                            <Box style={{ flex: 1, marginLeft: 12 }}>
                                <Text truncate fw={600}>
                                    {org.name}
                                </Text>
                                <Text fz="xs" c="gray">
                                    {org.membersCount} members
                                </Text>
                            </Box>
                            <IconChevronRight size={24} color={Colors.GRAY3} />
                        </Card>
                    ))}
                    <BigButton
                        fill
                        intent={'primary'}
                        disabled={disabled}
                        loading={isCreatingOrg}
                        onClick={() => createOrg({ name: '' })}
                    >
                        Create a new one
                    </BigButton>
                </CardWrapper>
            </FormWrapper>
        </Page>
    );
};
