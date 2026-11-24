import { getEmailDomain } from '@lightdash/common';
import {
    Anchor,
    Avatar,
    Button,
    Card,
    Group,
    Stack,
    Text,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useNavigate } from 'react-router';
import AuthLayout from '../components/common/AuthLayout';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
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

    // Read by both the effect that fires the auto-create and the guard that
    // holds the page while it is on its way. Derived once: two copies of this
    // condition can drift into a guard that spins for an effect that will
    // never fire, with no way out of the spinner.
    const shouldAutoCreateOrg =
        !allowedOrgs?.length && !user.data?.organizationUuid && !createOrgError;

    useEffect(() => {
        if (shouldAutoCreateOrg && !isCreatingOrg && !isLoadingAllowedOrgs) {
            createOrg({ name: '' });
        }
    }, [shouldAutoCreateOrg, createOrg, isCreatingOrg, isLoadingAllowedOrgs]);

    useEffect(() => {
        if ((hasCreatedOrg || hasJoinedOrg) && !createOrgError) {
            void navigate('/');
        }
    }, [createOrgError, hasCreatedOrg, hasJoinedOrg, navigate]);

    if (
        health.isInitialLoading ||
        isLoadingAllowedOrgs ||
        isCreatingOrg ||
        shouldAutoCreateOrg ||
        hasCreatedOrg ||
        hasJoinedOrg
    ) {
        return <PageSpinner />;
    }

    const disabled = isCreatingOrg || isJoiningOrg;

    if (createOrgError) {
        const errorState = (
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
        );

        return (
            <AuthLayout pageTitle="Join a workspace">{errorState}</AuthLayout>
        );
    }

    const orgList = (
        <Stack justify="center" gap="md" mb="xs">
            <Text c="dimmed" ta="left">
                The workspaces below are open to anyone with a{' '}
                <Text span fw={600}>
                    @{emailDomain}
                </Text>{' '}
                domain
            </Text>
            {allowedOrgs?.map((org) => (
                <Card key={org.organizationUuid}>
                    <Group justify="space-between">
                        <Group gap="md">
                            <Avatar size="md" radius="xl" color="ldGray.6">
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
                            onClick={() => joinOrg(org.organizationUuid)}
                            loading={isJoiningOrg}
                        >
                            Join
                        </Button>
                    </Group>
                </Card>
            ))}
        </Stack>
    );

    return (
        <AuthLayout
            pageTitle="Join a workspace"
            title="Join a workspace"
            footer={
                <Anchor
                    className={disabled ? styles.disabledAnchor : undefined}
                    component="button"
                    onClick={() => createOrg({ name: '' })}
                    ta="center"
                    size="sm"
                >
                    Create a new workspace
                </Anchor>
            }
        >
            {orgList}
        </AuthLayout>
    );
};

export default JoinOrganizationPage;
