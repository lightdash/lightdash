import {
    Button,
    Stack,
    Textarea,
    TextInput,
    type ModalProps,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconAppWindow } from '@tabler/icons-react';
import { type FC } from 'react';
import { useUpdateApp } from '../../../features/apps/hooks/useUpdateApp';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import MantineModal from '../MantineModal';

interface AppUpdateModalProps {
    opened: ModalProps['opened'];
    onClose: ModalProps['onClose'];
    uuid: string;
    initialName: string;
    initialDescription: string;
    onConfirm?: () => void;
}

type FormState = {
    name: string;
    description: string;
};

const AppUpdateModal: FC<AppUpdateModalProps> = ({
    uuid,
    initialName,
    initialDescription,
    onConfirm,
    ...modalProps
}) => {
    const projectUuid = useProjectUuid();
    const { mutateAsync, isLoading: isUpdating } = useUpdateApp();

    const form = useForm<FormState>({
        initialValues: {
            name: initialName,
            description: initialDescription,
        },
    });

    if (!projectUuid) {
        return null;
    }

    const handleConfirm = form.onSubmit(async (data) => {
        const trimmedName = data.name.trim();
        const trimmedDescription = data.description.trim();
        const patch: { name?: string; description?: string } = {};
        if (trimmedName !== initialName) patch.name = trimmedName;
        if (trimmedDescription !== initialDescription) {
            patch.description = trimmedDescription;
        }
        if (Object.keys(patch).length > 0) {
            await mutateAsync({
                projectUuid,
                appUuid: uuid,
                ...patch,
            });
        }
        onConfirm?.();
    });

    return (
        <MantineModal
            title="Update Data App"
            {...modalProps}
            icon={IconAppWindow}
            actions={
                <Button
                    disabled={!form.isValid() || !form.values.name.trim()}
                    loading={isUpdating}
                    type="submit"
                    form="update-app"
                >
                    Save
                </Button>
            }
        >
            <form id="update-app" onSubmit={handleConfirm}>
                <Stack>
                    <TextInput
                        label="Name"
                        required
                        placeholder="eg. Sales insights"
                        disabled={isUpdating}
                        {...form.getInputProps('name')}
                    />

                    <Textarea
                        label="Description"
                        placeholder="A few words to give your team some context"
                        disabled={isUpdating}
                        autosize
                        maxRows={3}
                        {...form.getInputProps('description')}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};

export default AppUpdateModal;
