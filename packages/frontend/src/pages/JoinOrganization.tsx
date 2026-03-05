import { getEmailDomain } from '@lightdash/common';
import {
    Anchor,
    Avatar,
    Box,
    Button,
    Card,
    Group,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useNavigate } from 'react-router';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import LightdashLogo from '../components/LightdashLogo/LightdashLogo';
import PageSpinner from '../components/PageSpinner';
import { useOrganizationCreateMutation } from '../hooks/organization/useOrganizationCreateMutation';
import useAllowedOrganizations from '../hooks/user/useAllowedOrganizations';
import { useJoinOrganizationMutation } from '../hooks/user/useJoinOrganizationMutation';
import { useDeleteUserMutation } from '../hooks/user/useUserDeleteMutation';
import useApp from '../providers/App/useApp';
import styles from './JoinOrganization.module.css';

const JoinOrganizationPage: FC = () => {
    const { health, user } = useApp();
    const navigate = useNavigate();
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
            void navigate('/');
        }
    }, [createOrgError, hasCreatedOrg, hasJoinedOrg, navigate]);

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
                    <Box mx="auto" my="lg">
                        <LightdashLogo />
                    </Box>
                    <Card p="xl" radius="md" withBorder>
                        <Stack justify="center" gap="md" mb="xs">
                            <Title order={3} ta="center">
                                Join a workspace
                            </Title>
                            <Text c="ldGray.6" ta="center">
                                The workspaces below are open to anyone with a{' '}
                                <Text span fw={600}>
                                    @{emailDomain}
                                </Text>{' '}
                                domain
                            </Text>
                            {allowedOrgs?.map((org) => (
                                <Card key={org.organizationUuid} withBorder>
                                    <Group justify="space-between">
                                        <Group gap="md">
                                            <Avatar
                                                size="md"
                                                radius="xl"
                                                color="ldGray.6"
                                            >
                                                {org.name[0]?.toUpperCase()}
                                            </Avatar>
                                            <Stack gap="two">
                                                <Text truncate="end" fw={600}>
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
                        className={disabled ? styles.disabledAnchor : undefined}
                        component="button"
                        onClick={() => createOrg({ name: '' })}
                        ta="center"
                        size="sm"
                    >
                        Create a new workspace
                    </Anchor>
                </Stack>
            )}
        </Page>
    );
};

export default JoinOrganizationPage;
