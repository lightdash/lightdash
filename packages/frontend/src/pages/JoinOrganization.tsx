import { getEmailDomain } from '@lightdash/common';
import {
    Anchor,
    Avatar,
    Button,
    Card,
    Group,
    Image,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useEffect, type FC } from 'react';
import { useHistory } from 'react-router-dom';

import { IconAlertCircle } from '@tabler/icons-react';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import PageSpinner from '../components/PageSpinner';
import { useOrganizationCreateMutation } from '../hooks/organization/useOrganizationCreateMutation';
import useAllowedOrganizations from '../hooks/user/useAllowedOrganizations';
import { useJoinOrganizationMutation } from '../hooks/user/useJoinOrganizationMutation';
import { useDeleteUserMutation } from '../hooks/user/useUserDeleteMutation';
import { useApp } from '../providers/AppProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';

const JoinOrganizationPage: FC = () => {
    const { health, user } = useApp();
    const history = useHistory();
    const { isInitialLoading: isLoadingAllowedOrgs, data: allowedOrgs } =
        useAllowedOrganizations();
    const {
        mutate: createOrg,
        isLoading: isCreatingOrg,
        isSuccess: hasCreatedOrg,
        error: createOrgError,
    } = useOrganizationCreateMutation();
    const { mutate: deleteUser } = useDeleteUserMutation();
    const {
        mutate: joinOrg,
        isLoading: isJoiningOrg,
        isSuccess: hasJoinedOrg,
    } = useJoinOrganizationMutation();
    const emailDomain = user.data?.email ? getEmailDomain(user.data.email) : '';

    useEffect(() => {
        const isAllowedToJoinOrgs = allowedOrgs && allowedOrgs.length > 0;
        const userHasOrg = user.data && !!user.data.organizationUuid;
        if (
            !isCreatingOrg &&
            !isLoadingAllowedOrgs &&
            !userHasOrg &&
            !isAllowedToJoinOrgs &&
            !createOrgError
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
        createOrgError,
    ]);

    useEffect(() => {
        if ((hasCreatedOrg || hasJoinedOrg) && !createOrgError) {
            history.push('/');
        }
    }, [createOrgError, hasCreatedOrg, hasJoinedOrg, history]);

    if (health.isInitialLoading || isLoadingAllowedOrgs || isCreatingOrg) {
        return <PageSpinner />;
    }

    const disabled = isCreatingOrg || isJoiningOrg;

    return (
        <Page title="Join a workspace" withCenteredContent withNavbar={false}>
            {createOrgError ? (
                <Stack mt="4xl">
                    <SuboptimalState
                        icon={IconAlertCircle}
                        title="Error"
                        description={createOrgError.error.message}
                        action={
                            <Button onClick={() => deleteUser()}>
                                Cancel registration
                            </Button>
                        }
                    />
                </Stack>
            ) : (
                <Stack w={400} mt="4xl">
                    <Image
                        src={
                            health.data?.siteLogoBlack
                                ? health.data?.siteLogoBlack
                                : LightdashLogo
                        }
                        alt={`${health.data?.siteName} logo`}
                        width={130}
                        mx="auto"
                        my="lg"
                    />
                    <Card p="xl" radius="xs" withBorder shadow="xs">
                        <Stack justify="center" spacing="md" mb="xs">
                            <Title order={3} ta="center">
                                Join a workspace
                            </Title>
                            <Text color="gray.6" ta="center">
                                The workspaces below are open to anyone with a{' '}
                                <Text span fw={600}>
                                    @{emailDomain}:
                                </Text>{' '}
                                domain
                            </Text>
                            {allowedOrgs?.map((org) => (
                                <Card key={org.organizationUuid} withBorder>
                                    <Group position="apart">
                                        <Group spacing="md">
                                            <Avatar
                                                size="md"
                                                radius="xl"
                                                color="gray.6"
                                            >
                                                {org.name[0]?.toUpperCase()}
                                            </Avatar>
                                            <Stack spacing="two">
                                                <Text truncate fw={600}>
                                                    {org.name}
                                                </Text>
                                                <Text fz="xs" c="gray">
                                                    {org.membersCount} members
                                                </Text>
                                            </Stack>
                                        </Group>
                                        <Button
                                            onClick={() =>
                                                joinOrg(org.organizationUuid)
                                            }
                                            loading={isJoiningOrg}
                                        >
                                            Join
                                        </Button>
                                    </Group>
                                </Card>
                            ))}
                        </Stack>
                    </Card>
                    <Anchor
                        component="button"
                        onClick={() => createOrg({ name: '' })}
                        disabled={disabled}
                        ta="center"
                        size="sm"
                        sx={(theme) =>
                            disabled
                                ? {
                                      color: theme.colors.gray[6],
                                      '&:hover': {
                                          textDecoration: 'none',
                                          color: theme.colors.gray[6],
                                      },
                                  }
                                : {}
                        }
                    >
                        Create a new workspace
                    </Anchor>
                </Stack>
            )}
        </Page>
    );
};

export default JoinOrganizationPage;
