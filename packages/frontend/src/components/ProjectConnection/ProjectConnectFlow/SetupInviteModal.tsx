import {
    FeatureFlags,
    getEmailSchema,
    InviteLinkPurpose,
    OrganizationMemberRole,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Button,
    CopyButton,
    Group,
    Loader,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { captureException } from '@sentry/react';
import { IconCheck, IconCopy, IconUserPlus } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useEnsurePlaygroundProject } from '../../../hooks/useEnsurePlaygroundProject';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import { useUserUpdateMutation } from '../../../hooks/user/useUserUpdateMutation';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import Callout from '../../common/Callout';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import {
    getPlaygroundSetupFailure,
    isRetryablePlaygroundSetupFailure,
    PLAYGROUND_SETUP_FAILURE_MESSAGES,
    type PlaygroundSetupFailure,
} from './playgroundSetupFailure';

type SetupInviteFormValues = {
    firstName: string;
    lastName: string;
    email: string;
};

const SetupInviteModal: FC<{
    opened: boolean;
    onClose: () => void;
}> = ({ opened, onClose }) => {
    const { health, user } = useApp();
    const existingFirstName = user.data?.firstName ?? '';
    const existingLastName = user.data?.lastName ?? '';
    const needsName = !existingFirstName.trim() || !existingLastName.trim();

    const form = useForm<SetupInviteFormValues>({
        initialValues: {
            firstName: existingFirstName,
            lastName: existingLastName,
            email: '',
        },
        validate: zodResolver(
            z.object({
                firstName: needsName
                    ? z.string().trim().min(1, 'Required')
                    : z.string(),
                lastName: needsName
                    ? z.string().trim().min(1, 'Required')
                    : z.string(),
                email: getEmailSchema(),
            }),
        ),
    });
    const {
        data: inviteLink,
        mutateAsync,
        reset,
        isLoading,
    } = useCreateInviteLinkMutation();
    const { mutateAsync: updateUserAsync, isLoading: isUpdatingUser } =
        useUserUpdateMutation();
    const { track } = useTracking();
    const navigate = useNavigate();

    const newOnboardingFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    const { data: organization } = useOrganization();
    const [playgroundFailure, setPlaygroundFailure] =
        useState<PlaygroundSetupFailure | null>(null);
    const {
        mutateAsync: ensurePlaygroundAsync,
        isLoading: isPreparingPlayground,
    } = useEnsurePlaygroundProject();

    // The flag says the flow exists, not that a playground can be provisioned:
    // an org that already has a project would be sent into that project instead
    const canOfferPlayground =
        newOnboardingFlag.data?.enabled === true &&
        organization?.needsProject === true &&
        playgroundFailure === null;

    const handleClose = () => {
        form.reset();
        reset();
        setPlaygroundFailure(null);
        onClose();
    };

    const preparePlayground = async () => {
        try {
            const { projectUuid } = await ensurePlaygroundAsync();
            track({ name: EventName.PLAYGROUND_PROJECT_ENTERED });
            void navigate(`/projects/${projectUuid}/home`);
        } catch (error) {
            setPlaygroundFailure(getPlaygroundSetupFailure(error));
            captureException(error, {
                tags: { feature: 'playground-onboarding' },
            });
        }
    };

    const handleSubmit = async (values: SetupInviteFormValues) => {
        if (needsName) {
            await updateUserAsync({
                firstName: values.firstName.trim(),
                lastName: values.lastName.trim(),
            });
        }
        await mutateAsync({
            email: values.email,
            role: OrganizationMemberRole.ADMIN,
            purpose: InviteLinkPurpose.Setup,
        });
        track({ name: EventName.SETUP_INVITE_SENT });

        if (canOfferPlayground) {
            await preparePlayground();
        }
    };

    const isSubmitting = isLoading || isUpdatingUser;

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title="Invite someone to set this up"
            icon={IconUserPlus}
            size="lg"
            cancelLabel={inviteLink || isPreparingPlayground ? false : 'Cancel'}
            actions={
                isPreparingPlayground ? null : inviteLink ? (
                    <Group gap="xs">
                        {playgroundFailure &&
                            isRetryablePlaygroundSetupFailure(
                                playgroundFailure,
                            ) && (
                                <Button
                                    variant="default"
                                    onClick={() => {
                                        setPlaygroundFailure(null);
                                        void preparePlayground();
                                    }}
                                >
                                    Try again
                                </Button>
                            )}
                        <Button onClick={handleClose}>Done</Button>
                    </Group>
                ) : (
                    <Button
                        loading={isSubmitting}
                        type="submit"
                        form="setup_invite"
                    >
                        Send invite
                    </Button>
                )
            }
        >
            {isPreparingPlayground ? (
                <Group gap="md" wrap="nowrap">
                    <Loader size="sm" />
                    <Stack gap={2}>
                        <Text size="sm" fw={500}>
                            Preparing a sample project…
                        </Text>
                        <Text size="sm" c="dimmed">
                            Explore sample data while your expert connects your
                            warehouse.
                        </Text>
                    </Stack>
                </Group>
            ) : inviteLink ? (
                <Stack gap="sm">
                    {playgroundFailure && (
                        <Callout
                            variant="warning"
                            title="We couldn't set up a sample project"
                        >
                            <Text size="sm">
                                {
                                    PLAYGROUND_SETUP_FAILURE_MESSAGES[
                                        playgroundFailure
                                    ]
                                }
                            </Text>
                        </Callout>
                    )}
                    <Alert
                        icon={<IconCheck />}
                        color="green"
                        title="Invite ready"
                    >
                        <Stack gap="sm">
                            <Text size="sm">
                                {health.data?.hasEmailClient ? (
                                    <>
                                        Invite sent to <b>{inviteLink.email}</b>{' '}
                                        — we'll take them straight to warehouse
                                        setup.
                                    </>
                                ) : (
                                    <>
                                        Share this link with{' '}
                                        <b>{inviteLink.email}</b> to take them
                                        straight to warehouse setup.
                                    </>
                                )}
                            </Text>
                            <TextInput
                                readOnly
                                className="sentry-block ph-no-capture"
                                value={inviteLink.inviteUrl}
                                rightSection={
                                    <CopyButton value={inviteLink.inviteUrl}>
                                        {({ copied, copy }) => (
                                            <Tooltip
                                                label={
                                                    copied ? 'Copied' : 'Copy'
                                                }
                                                withArrow
                                                position="right"
                                            >
                                                <ActionIcon
                                                    color={
                                                        copied ? 'teal' : 'gray'
                                                    }
                                                    onClick={copy}
                                                >
                                                    <MantineIcon
                                                        icon={
                                                            copied
                                                                ? IconCheck
                                                                : IconCopy
                                                        }
                                                    />
                                                </ActionIcon>
                                            </Tooltip>
                                        )}
                                    </CopyButton>
                                }
                            />
                        </Stack>
                    </Alert>
                </Stack>
            ) : (
                <form
                    id="setup_invite"
                    name="setup_invite"
                    onSubmit={form.onSubmit((values) => handleSubmit(values))}
                >
                    <Stack gap="sm">
                        {needsName && (
                            <>
                                <Group grow gap="sm">
                                    <TextInput
                                        name="firstName"
                                        label="Your first name"
                                        required
                                        disabled={isSubmitting}
                                        {...form.getInputProps('firstName')}
                                    />
                                    <TextInput
                                        name="lastName"
                                        label="Your last name"
                                        required
                                        disabled={isSubmitting}
                                        {...form.getInputProps('lastName')}
                                    />
                                </Group>
                                <Text size="sm" c="dimmed">
                                    We'll include your name in the invite so
                                    they know who's asking.
                                </Text>
                            </>
                        )}
                        <TextInput
                            name="email"
                            label="Their email address"
                            placeholder="example@company.com"
                            required
                            disabled={isSubmitting}
                            {...form.getInputProps('email')}
                        />
                        <Text size="sm" c="dimmed">
                            We'll ask them to connect your data warehouse.
                        </Text>
                    </Stack>
                </form>
            )}
        </MantineModal>
    );
};

export default SetupInviteModal;
