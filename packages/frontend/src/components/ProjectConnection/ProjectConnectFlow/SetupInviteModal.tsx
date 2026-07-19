import {
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
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconCheck, IconCopy, IconUserPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { z } from 'zod';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import { useUserUpdateMutation } from '../../../hooks/user/useUserUpdateMutation';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';

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

    const handleClose = () => {
        form.reset();
        reset();
        onClose();
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
    };

    const isSubmitting = isLoading || isUpdatingUser;

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title="Invite someone to set this up"
            icon={IconUserPlus}
            size="lg"
            cancelLabel={inviteLink ? false : 'Cancel'}
            actions={
                inviteLink ? (
                    <Button onClick={handleClose}>Done</Button>
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
            {inviteLink ? (
                <Alert icon={<IconCheck />} color="green" title="Invite ready">
                    <Stack gap="sm">
                        <Text size="sm">
                            {health.data?.hasEmailClient ? (
                                <>
                                    Invite sent to <b>{inviteLink.email}</b> —
                                    we'll take them straight to warehouse setup.
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
                                            label={copied ? 'Copied' : 'Copy'}
                                            withArrow
                                            position="right"
                                        >
                                            <ActionIcon
                                                color={copied ? 'teal' : 'gray'}
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
