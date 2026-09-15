import {
    DEFAULT_INVITE_LINK_EXPIRATION_DAYS,
    getEmailSchema,
    OrganizationMemberRole,
    type CreateInviteLink,
} from '@lightdash/common';
import { Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUser } from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { type FC } from 'react';
import { z } from 'zod';
import { useOrganizationSettings } from '../../../hooks/organization/useOrganizationSettings';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import useApp from '../../../providers/App/useApp';
import { TrackPage } from '../../../providers/Tracking/TrackingProvider';
import useTracking from '../../../providers/Tracking/useTracking';
import {
    CategoryName,
    EventName,
    PageName,
    PageType,
} from '../../../types/Events';
import MantineModal from '../../common/MantineModal';
import InviteSuccess from './InviteSuccess';

type SendInviteFormProps = Omit<CreateInviteLink, 'expiresAt'>;

const InvitesModal: FC<{
    opened: boolean;
    onClose: () => void;
}> = ({ opened, onClose }) => {
    const form = useForm<SendInviteFormProps>({
        initialValues: {
            email: '',
            role: OrganizationMemberRole.EDITOR,
        },
        validate: zodResolver(
            z.object({
                email: getEmailSchema(),
            }),
        ),
    });
    const { track } = useTracking();
    const { health, user } = useApp();
    const canManageOrganization =
        user.data?.ability?.can('manage', 'Organization') ?? false;
    const organizationSettings = useOrganizationSettings({
        enabled: opened && canManageOrganization,
    });
    const inviteLinkExpirationDays =
        organizationSettings.data?.inviteLinkExpirationDays ??
        DEFAULT_INVITE_LINK_EXPIRATION_DAYS;
    const {
        data: inviteLink,
        mutateAsync,
        isLoading,
    } = useCreateInviteLinkMutation();
    const isSubmitting = isLoading;

    const handleSubmit = async (data: SendInviteFormProps) => {
        track({
            name: EventName.INVITE_BUTTON_CLICKED,
        });
        await mutateAsync(data);
        form.reset();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Add user"
            icon={IconUser}
            size="lg"
            cancelLabel={false}
            actions={
                <Button
                    disabled={isSubmitting}
                    loading={isSubmitting}
                    type="submit"
                    form="invite_user"
                >
                    {health.data?.hasEmailClient
                        ? 'Send invite'
                        : 'Generate invite'}
                </Button>
            }
        >
            <TrackPage
                name={PageName.INVITE_MANAGEMENT_SETTINGS}
                type={PageType.MODAL}
                category={CategoryName.SETTINGS}
            >
                <form
                    id="invite_user"
                    name="invite_user"
                    onSubmit={form.onSubmit((values: SendInviteFormProps) =>
                        handleSubmit(values),
                    )}
                >
                    <Stack gap="md">
                        <Group gap="xs" align="start" wrap="nowrap">
                            <TextInput
                                name="email"
                                label="Enter user email address"
                                placeholder="example@gmail.com"
                                required
                                disabled={isSubmitting}
                                flex={1}
                                {...form.getInputProps('email')}
                            />
                            {canManageOrganization && (
                                <Select
                                    data={Object.values(
                                        OrganizationMemberRole,
                                    ).map((orgMemberRole) => ({
                                        value: orgMemberRole,
                                        label: orgMemberRole.replace('_', ' '),
                                    }))}
                                    disabled={isSubmitting}
                                    required
                                    placeholder="Select role"
                                    comboboxProps={{
                                        position: 'bottom',
                                        withinPortal: true,
                                    }}
                                    mt={20}
                                    w={180}
                                    {...form.getInputProps('role')}
                                />
                            )}
                        </Group>
                        {canManageOrganization && organizationSettings.data ? (
                            <Text c="dimmed" fz="sm">
                                New invite links expire after{' '}
                                {inviteLinkExpirationDays}{' '}
                                {inviteLinkExpirationDays === 1
                                    ? 'day'
                                    : 'days'}
                                . You can change this in General settings.
                            </Text>
                        ) : null}
                    </Stack>
                </form>
                {inviteLink && (
                    <InviteSuccess invite={inviteLink} hasMarginTop />
                )}
            </TrackPage>
        </MantineModal>
    );
};

export default InvitesModal;
