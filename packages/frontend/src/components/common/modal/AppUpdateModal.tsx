import {
    Button,
    Stack,
    Textarea,
    TextInput,
    type ModalProps,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconAppWindow, type Icon as IconType } from '@tabler/icons-react';
import { type FC } from 'react';
import { z } from 'zod';
import { useUpdateApp } from '../../../features/apps/hooks/useUpdateApp';
import MantineModal from '../MantineModal';

interface AppUpdateModalProps {
    opened: ModalProps['opened'];
    onClose: ModalProps['onClose'];
    projectUuid: string;
    uuid: string;
    initialName: string;
    initialDescription: string;
    /** What the app is called to the user; chart types are apps too. */
    resourceLabel?: string;
    icon?: IconType;
    onConfirm?: () => void;
}

const updateAppSchema = z.object({
    name: z.string().trim().min(1, { message: 'Name is required' }),
    description: z.string(),
});

type FormState = z.infer<typeof updateAppSchema>;

const AppUpdateModal: FC<AppUpdateModalProps> = ({
    projectUuid,
    uuid,
    initialName,
    initialDescription,
    resourceLabel = 'Data App',
    icon = IconAppWindow,
    onConfirm,
    ...modalProps
}) => {
    const { mutateAsync, isLoading: isUpdating } = useUpdateApp({
        resourceLabel,
    });

    const form = useForm<FormState>({
        initialValues: {
            name: initialName,
            description: initialDescription,
        },
        validate: zodResolver(updateAppSchema),
        validateInputOnChange: true,
    });

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
            title={`Update ${resourceLabel}`}
            {...modalProps}
            icon={icon}
            actions={
                <Button
                    disabled={!form.isValid()}
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
