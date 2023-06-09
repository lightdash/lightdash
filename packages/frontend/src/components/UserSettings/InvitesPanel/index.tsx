import {
    CreateInviteLink,
    OrganizationMemberRole,
    validateEmail,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Select,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconChevronLeft, IconInfoCircle } from '@tabler/icons-react';
import React, { FC, useEffect } from 'react';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import InviteSuccess from '../UserManagementPanel/InviteSuccess';

type SendInviteFormProps = Omit<CreateInviteLink, 'expiresAt'>;
const InvitePanel: FC<{
    onBackClick: () => void;
}> = ({ onBackClick }) => {
    const form = useForm<SendInviteFormProps>({
        initialValues: {
            email: '',
            role: OrganizationMemberRole.EDITOR,
        },
        validate: {
            email: (value: string) =>
                validateEmail(value) ? null : 'Your email address is not valid',
        },
    });
    const { track } = useTracking();
    const { health, user } = useApp();
    const {
        data: inviteLink,
        mutate,
        isLoading,
        isSuccess,
    } = useCreateInviteLinkMutation();
    const handleSubmit = (data: SendInviteFormProps) => {
        track({
            name: EventName.INVITE_BUTTON_CLICKED,
        });
        mutate(data);
    };

    useEffect(() => {
        if (isSuccess) {
            form.setFieldValue('email', '');
            form.setFieldValue('role', OrganizationMemberRole.EDITOR);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.setFieldValue, isSuccess]);

    return (
        <>
            <Group position="apart" pb="md">
                <Group spacing="two">
                    <Title order={5}>User management settings</Title>
                    <Tooltip label="Click here to learn more about user roles">
                        <ActionIcon
                            component="a"
                            href="https://docs.lightdash.com/references/roles"
                            target="_blank"
                            rel="noreferrer"
                        >
                            <MantineIcon icon={IconInfoCircle} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
                <Button
                    leftIcon={<MantineIcon icon={IconChevronLeft} />}
                    onClick={onBackClick}
                >
                    Back to all users
                </Button>
            </Group>
            <SettingsCard>
                <form
                    name="invite_user"
                    onSubmit={form.onSubmit((values: SendInviteFormProps) =>
                        handleSubmit(values),
                    )}
                >
                    <Group align="flex-end" position="apart">
                        <TextInput
                            name="email"
                            label="Enter user email address"
                            placeholder="example@gmail.com"
                            required
                            disabled={isLoading}
                            w="50%"
                            {...form.getInputProps('email')}
                        />
                        <Group spacing="xs">
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
            </SettingsCard>
            {inviteLink && <InviteSuccess invite={inviteLink} hasMarginTop />}
        </>
    );
};

export default InvitePanel;
