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
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('userSettings');
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
    const roleOptions = useMemo(() => {
        const roleLabels: Record<OrganizationMemberRole, string> = {
            [OrganizationMemberRole.MEMBER]: t(
                'usersAndGroupsPanel.invitesModal.roles.member',
            ),
            [OrganizationMemberRole.VIEWER]: t(
                'usersAndGroupsPanel.invitesModal.roles.viewer',
            ),
            [OrganizationMemberRole.INTERACTIVE_VIEWER]: t(
                'usersAndGroupsPanel.invitesModal.roles.interactiveViewer',
            ),
            [OrganizationMemberRole.EDITOR]: t(
                'usersAndGroupsPanel.invitesModal.roles.editor',
            ),
            [OrganizationMemberRole.DEVELOPER]: t(
                'usersAndGroupsPanel.invitesModal.roles.developer',
            ),
            [OrganizationMemberRole.ADMIN]: t(
                'usersAndGroupsPanel.invitesModal.roles.admin',
            ),
        };
        return Object.values(OrganizationMemberRole).map((orgMemberRole) => ({
            value: orgMemberRole,
            label: roleLabels[orgMemberRole],
        }));
    }, [t]);

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
            title={t('usersAndGroupsPanel.invitesModal.title')}
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
                        ? t('usersAndGroupsPanel.invitesModal.sendInvite')
                        : t('usersAndGroupsPanel.invitesModal.generateInvite')}
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
                                label={t(
                                    'usersAndGroupsPanel.invitesModal.emailLabel',
                                )}
                                placeholder="example@gmail.com"
                                required
                                disabled={isSubmitting}
                                flex={1}
                                {...form.getInputProps('email')}
                            />
                            {canManageOrganization && (
                                <Select
                                    data={roleOptions}
                                    disabled={isSubmitting}
                                    required
                                    placeholder={t(
                                        'usersAndGroupsPanel.invitesModal.selectRole',
                                    )}
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
                                {t(
                                    'usersAndGroupsPanel.invitesModal.expirationNote',
                                    {
                                        count: inviteLinkExpirationDays,
                                    },
                                )}
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
