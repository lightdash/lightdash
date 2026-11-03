import {
    getEmailSchema,
    getUserNameSchema,
    InviteLinkPurpose,
    OrganizationMemberRole,
} from '@lightdash/common';
import { Flex, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUserPlus } from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { type FC } from 'react';
import { z } from 'zod';
import useToaster from '../../../hooks/toaster/useToaster';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import { useUserUpdateMutation } from '../../../hooks/user/useUserUpdateMutation';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import MantineModal from '../../common/MantineModal';

export const InviteTeammateModal: FC<{
    opened: boolean;
    onClose: () => void;
    organizationUuid: string;
}> = ({ opened, onClose, organizationUuid }) => {
    const { user } = useApp();
    const { track } = useTracking();
    const { showToastSuccess } = useToaster();
    const firstName = user.data?.firstName ?? '';
    const lastName = user.data?.lastName ?? '';
    const needsName = !firstName.trim() || !lastName.trim();

    const form = useForm({
        initialValues: { firstName, lastName, email: '' },
        validate: zodResolver(
            z.object({
                firstName: needsName ? getUserNameSchema() : z.string(),
                lastName: needsName ? getUserNameSchema() : z.string(),
                email: getEmailSchema(),
            }),
        ),
    });
    const invite = useCreateInviteLinkMutation({ showSuccessToast: false });
    const updateUser = useUserUpdateMutation();
    const isSubmitting = invite.isLoading || updateUser.isLoading;

    const close = () => {
        form.reset();
        onClose();
    };

    const submit = form.onSubmit(async (values) => {
        if (needsName) {
            await updateUser.mutateAsync({
                firstName: values.firstName.trim(),
                lastName: values.lastName.trim(),
            });
        }
        await invite.mutateAsync({
            email: values.email,
            role: OrganizationMemberRole.ADMIN,
            purpose: InviteLinkPurpose.Setup,
        });
        track({
            name: EventName.SETUP_INVITE_SENT,
            properties: { organizationId: organizationUuid },
        });
        showToastSuccess({
            title: `Invite sent to ${values.email}`,
            subtitle: "We'll take them straight to warehouse setup.",
        });
        close();
    });

    return (
        <MantineModal
            opened={opened}
            onClose={close}
            title="Ask them to connect your data"
            description={
                needsName
                    ? "They'll land straight on warehouse setup. Add your name so they know who's asking."
                    : "They'll land straight on warehouse setup."
            }
            icon={IconUserPlus}
            size="md"
            confirmLabel="Send invite"
            confirmLoading={isSubmitting}
            cancelDisabled={isSubmitting}
            onConfirm={() => submit()}
        >
            <form onSubmit={submit}>
                <Stack gap="sm">
                    {needsName && (
                        <Flex
                            direction={{ base: 'column', sm: 'row' }}
                            gap="sm"
                        >
                            <TextInput
                                autoComplete="given-name"
                                flex={1}
                                label="First name"
                                required
                                disabled={isSubmitting}
                                {...form.getInputProps('firstName')}
                            />
                            <TextInput
                                autoComplete="family-name"
                                flex={1}
                                label="Last name"
                                required
                                disabled={isSubmitting}
                                {...form.getInputProps('lastName')}
                            />
                        </Flex>
                    )}
                    <TextInput
                        type="email"
                        label="Their work email"
                        placeholder="name@company.com"
                        required
                        data-autofocus
                        disabled={isSubmitting}
                        {...form.getInputProps('email')}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};
