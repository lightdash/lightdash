import { Button, getDefaultZIndex, Group, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUser } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import MantineModal from '../../components/common/MantineModal';
import { useUserUpdateMutation } from '../../hooks/user/useUserUpdateMutation';
import useApp from '../../providers/App/useApp';
import { type NamePromptTrigger } from '../../providers/Tracking/types';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { NAME_PROMPT_REASONS } from './namePrompt';

export const NamePromptModal: FC<{
    trigger: NamePromptTrigger;
    onSaved?: () => void;
    onClose: () => void;
}> = ({ trigger, onSaved, onClose }) => {
    const { user } = useApp();
    const { track } = useTracking();
    const updateUser = useUserUpdateMutation();
    const organizationId = user.data?.organizationUuid;
    const form = useForm({
        initialValues: {
            firstName: user.data?.firstName ?? '',
            lastName: user.data?.lastName ?? '',
        },
        validate: {
            firstName: (value) =>
                value.trim() ? null : 'Enter your first name',
            lastName: (value) => (value.trim() ? null : 'Enter your last name'),
        },
    });

    useEffect(() => {
        if (!organizationId) return;
        track({
            name: EventName.NAME_PROMPT_SHOWN,
            properties: { organizationId, trigger },
        });
    }, [organizationId, track, trigger]);

    const trackOutcome = (
        name: EventName.NAME_PROMPT_SAVED | EventName.NAME_PROMPT_CLOSED,
    ) => {
        if (!organizationId) return;
        track({ name, properties: { organizationId, trigger } });
    };

    const handleClose = () => {
        trackOutcome(EventName.NAME_PROMPT_CLOSED);
        onClose();
    };

    return (
        <MantineModal
            opened
            size="sm"
            onClose={handleClose}
            icon={IconUser}
            title="Add your name"
            description={NAME_PROMPT_REASONS[trigger]}
            cancelLabel={false}
            modalRootProps={{
                zIndex: getDefaultZIndex('popover') + 1,
                returnFocus: false,
            }}
            actions={
                <Button
                    size="xs"
                    type="submit"
                    form="name_prompt"
                    loading={updateUser.isLoading}
                >
                    Continue
                </Button>
            }
        >
            <form
                id="name_prompt"
                onSubmit={form.onSubmit((values) =>
                    updateUser.mutate(
                        {
                            firstName: values.firstName.trim(),
                            lastName: values.lastName.trim(),
                        },
                        {
                            onSuccess: () => {
                                trackOutcome(EventName.NAME_PROMPT_SAVED);
                                onSaved?.();
                            },
                        },
                    ),
                )}
            >
                <Group grow>
                    <TextInput
                        label="First name"
                        required
                        data-autofocus
                        {...form.getInputProps('firstName')}
                    />
                    <TextInput
                        label="Last name"
                        required
                        {...form.getInputProps('lastName')}
                    />
                </Group>
            </form>
        </MantineModal>
    );
};
