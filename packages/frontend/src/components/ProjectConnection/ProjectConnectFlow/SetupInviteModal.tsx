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
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';

type SetupInviteFormValues = {
    email: string;
};

const SetupInviteModal: FC<{
    opened: boolean;
    onClose: () => void;
}> = ({ opened, onClose }) => {
    const { health } = useApp();
    const form = useForm<SetupInviteFormValues>({
        initialValues: {
            email: '',
        },
        validate: zodResolver(
            z.object({
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

    const handleClose = () => {
        form.reset();
        reset();
        onClose();
    };

    const handleSubmit = async (values: SetupInviteFormValues) => {
        await mutateAsync({
            email: values.email,
            role: OrganizationMemberRole.ADMIN,
            purpose: InviteLinkPurpose.Setup,
        });
    };

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
                        disabled={isLoading}
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
                        <TextInput
                            name="email"
                            label="Their email address"
                            placeholder="example@company.com"
                            required
                            disabled={isLoading}
                            {...form.getInputProps('email')}
                        />
                        <Text size="sm" c="dimmed">
                            We'll ask them to connect your data warehouse —
                            takes about 5 minutes.
                        </Text>
                    </Stack>
                </form>
            )}
        </MantineModal>
    );
};

export default SetupInviteModal;
