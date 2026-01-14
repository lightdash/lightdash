import {
    OrganizationMemberRole,
    getEmailSchema,
    type CreateInviteLink,
} from '@lightdash/common';
import { Button, Group, Select, TextInput } from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconUser } from '@tabler/icons-react';
import { type FC } from 'react';
import { z } from 'zod';
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
    const {
        data: inviteLink,
        mutateAsync,
        isLoading,
    } = useCreateInviteLinkMutation();
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
                <Button disabled={isLoading} type="submit" form="invite_user">
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
                    <Group gap="xs" align="start" wrap="nowrap">
                        <TextInput
                            name="email"
                            label="Enter user email address"
                            placeholder="example@gmail.com"
                            required
                            disabled={isLoading}
                            style={{ flex: 1 }}
                            {...form.getInputProps('email')}
                        />
                        {user.data?.ability?.can('manage', 'Organization') && (
                            <Select
                                data={Object.values(OrganizationMemberRole).map(
                                    (orgMemberRole) => ({
                                        value: orgMemberRole,
                                        label: orgMemberRole.replace('_', ' '),
                                    }),
                                )}
                                disabled={isLoading}
                                required
                                placeholder="Select role"
                                comboboxProps={{
                                    position: 'bottom',
                                    withinPortal: true,
                                }}
                                style={{ marginTop: 20, width: 180 }}
                                {...form.getInputProps('role')}
                            />
                        )}
                    </Group>
                </form>
                {inviteLink && (
                    <InviteSuccess invite={inviteLink} hasMarginTop />
                )}
            </TrackPage>
        </MantineModal>
    );
};

export default InvitesModal;
