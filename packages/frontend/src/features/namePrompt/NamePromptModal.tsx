import { Button, Group, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUser } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../components/common/MantineModal';
import { useUserUpdateMutation } from '../../hooks/user/useUserUpdateMutation';
import { type NamePromptTrigger } from '../../providers/Tracking/types';
import { NAME_PROMPT_REASONS } from './namePrompt';

export const NamePromptModal: FC<{
    trigger: NamePromptTrigger;
    firstName: string;
    lastName: string;
    onSaved: () => void;
    onSkip: () => void;
}> = ({ trigger, firstName, lastName, onSaved, onSkip }) => {
    const updateUser = useUserUpdateMutation();
    const form = useForm({
        initialValues: { firstName, lastName },
        validate: {
            firstName: (value) =>
                value.trim() ? null : 'Enter your first name',
            lastName: (value) => (value.trim() ? null : 'Enter your last name'),
        },
    });

    return (
        <MantineModal
            opened
            size="sm"
            onClose={onSkip}
            icon={IconUser}
            title="Add your name"
            description={NAME_PROMPT_REASONS[trigger]}
            cancelLabel="Skip"
            onCancel={onSkip}
            actions={
                <Button
                    size="xs"
                    type="submit"
                    form="name_prompt"
                    loading={updateUser.isLoading}
                >
                    Save and continue
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
                        { onSuccess: onSaved },
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
