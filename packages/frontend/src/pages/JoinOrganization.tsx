import {
    getEmailDomain,
    getOrganizationNameSchema,
    validateOrganizationName,
} from '@lightdash/common';
import {
    Anchor,
    Avatar,
    Button,
    Card,
    Group,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle } from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { useEffect, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import AuthLayout from '../components/common/AuthLayout';
import { useAuthLayoutVariant } from '../components/common/AuthLayout/useAuthLayoutVariant';
import MantineModal from '../components/common/MantineModal';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import PageSpinner from '../components/PageSpinner';
import { useOrganizationCreateMutation } from '../hooks/organization/useOrganizationCreateMutation';
import useAllowedOrganizations from '../hooks/user/useAllowedOrganizations';
import { useJoinOrganizationMutation } from '../hooks/user/useJoinOrganizationMutation';
import { useDeleteUserMutation } from '../hooks/user/useUserDeleteMutation';
import useApp from '../providers/App/useApp';
import styles from './JoinOrganization.module.css';

const createOrganizationSchema = z.object({
    name: getOrganizationNameSchema(),
});

type CreateOrganizationForm = z.infer<typeof createOrganizationSchema>;

const JoinOrganizationPage: FC = () => {
    const { health, user } = useApp();
    const { isNewLayout } = useAuthLayoutVariant();
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
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const createOrganizationForm = useForm<CreateOrganizationForm>({
        initialValues: { name: '' },
        validate: zodResolver(createOrganizationSchema),
    });
    const mustCreateOrganization =
        allowedOrgs?.length === 0 && !user.data?.organizationUuid;
    const showCreateOrganizationModal =
        mustCreateOrganization || isCreateModalOpen;

    const closeCreateOrganizationModal = () => {
        if (mustCreateOrganization) return;
        setIsCreateModalOpen(false);
        createOrganizationForm.reset();
    };

    const submitCreateOrganization = createOrganizationForm.onSubmit(
        ({ name }) => createOrg({ name: name.trim() }),
    );

    useEffect(() => {
        if ((hasCreatedOrg || hasJoinedOrg) && !createOrgError) {
            void navigate('/');
        }
    }, [createOrgError, hasCreatedOrg, hasJoinedOrg, navigate]);

    if (
        health.isInitialLoading ||
        isLoadingAllowedOrgs ||
        isCreatingOrg ||
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

        return isNewLayout ? (
            <AuthLayout pageTitle="Join a workspace" withLegacyCard={false}>
                {errorState}
            </AuthLayout>
        ) : (
            <Page
                title="Join a workspace"
                withCenteredContent
                withNavbar={false}
            >
                <Stack mt="4xl">{errorState}</Stack>
            </Page>
        );
    }

    const orgList = (
        <Stack justify="center" gap="md" mb="xs">
            {!isNewLayout && (
                <Title order={3} ta="center">
                    Join a workspace
                </Title>
            )}
            <Text c="dimmed" ta={isNewLayout ? 'left' : 'center'}>
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
        <>
            <AuthLayout
                pageTitle="Join a workspace"
                title={isNewLayout ? 'Join a workspace' : undefined}
                withLegacyCard={false}
                footer={
                    <Anchor
                        className={disabled ? styles.disabledAnchor : undefined}
                        component="button"
                        onClick={() => setIsCreateModalOpen(true)}
                        ta="center"
                        size="sm"
                    >
                        Create a new workspace
                    </Anchor>
                }
            >
                {isNewLayout ? (
                    orgList
                ) : (
                    <Card p="xl" radius="md">
                        {orgList}
                    </Card>
                )}
            </AuthLayout>
            <MantineModal
                opened={showCreateOrganizationModal}
                onClose={closeCreateOrganizationModal}
                title="Create a new workspace"
                subtitle="Choose a name for your organization."
                confirmLabel="Create workspace"
                confirmDisabled={
                    !validateOrganizationName(
                        createOrganizationForm.values.name,
                    )
                }
                confirmLoading={isCreatingOrg}
                onConfirm={submitCreateOrganization}
                withCloseButton={!mustCreateOrganization}
            >
                <form onSubmit={submitCreateOrganization}>
                    <TextInput
                        label="Organization name"
                        placeholder="Acme Analytics"
                        required
                        disabled={isCreatingOrg}
                        {...createOrganizationForm.getInputProps('name')}
                    />
                </form>
            </MantineModal>
        </>
    );
};

export default JoinOrganizationPage;
