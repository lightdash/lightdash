import {
    CreateInviteLink,
    getEmailSchema,
    OrganizationMemberRole,
} from '@lightdash/common';
import { Button, Group, Modal, Select, TextInput, Title } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconUser } from '@tabler/icons-react';
import React, { FC } from 'react';
import { z } from 'zod';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import { useApp } from '../../../providers/AppProvider';
import { TrackPage, useTracking } from '../../../providers/TrackingProvider';
import {
    CategoryName,
    EventName,
    PageName,
    PageType,
} from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
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
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconUser} />
                    <Title order={4}>Add user</Title>
                </Group>
            }
            size="lg"
        >
            <TrackPage
                name={PageName.INVITE_MANAGEMENT_SETTINGS}
                type={PageType.MODAL}
                category={CategoryName.SETTINGS}
            >
                <form
                    name="invite_user"
                    onSubmit={form.onSubmit((values: SendInviteFormProps) =>
                        handleSubmit(values),
                    )}
                >
                    <Group
                        spacing="xs"
                        align={form.errors.email ? 'center' : 'end'}
                    >
                        <TextInput
                            name="email"
                            label="Enter user email address"
                            placeholder="example@gmail.com"
                            required
                            disabled={isLoading}
                            w="43%"
                            {...form.getInputProps('email')}
                        />
                        <Group
                            spacing="xs"
                            align={form.errors.email ? 'center' : 'end'}
                        >
                            {user.data?.ability?.can(
                                'manage',
                                'Organization',
                            ) && (
                                <Select
                                    data={Object.values(
                                        OrganizationMemberRole,
                                    ).map((orgMemberRole) => ({
                                        value: orgMemberRole,
                                        label: orgMemberRole.replace('_', ' '),
                                    }))}
                                    disabled={isLoading}
                                    required
                                    placeholder="Select role"
                                    dropdownPosition="bottom"
                                    withinPortal
                                    {...form.getInputProps('role')}
                                />
                            )}
                            <Button disabled={isLoading} type="submit">
                                {health.data?.hasEmailClient
                                    ? 'Send invite'
                                    : 'Generate invite'}
                            </Button>
                        </Group>
                    </Group>
                </form>
                {inviteLink && (
                    <InviteSuccess invite={inviteLink} hasMarginTop />
                )}
            </TrackPage>
        </Modal>
    );
};

export default InvitesModal;
