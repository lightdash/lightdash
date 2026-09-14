import { chartTypeIconSchema, type ChartTypeIcon } from '@lightdash/common';
import {
    Button,
    Group,
    Stack,
    Textarea,
    TextInput,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAppWindow, type Icon as IconType } from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { type FC } from 'react';
import { z } from 'zod';
import { useUpdateApp } from '../../../features/apps/hooks/useUpdateApp';
import ChartTypeIconPicker from '../../../features/chartTypes/components/ChartTypeIconPicker';
import MantineModal from '../MantineModal';

interface AppUpdateModalProps {
    opened: ModalProps['opened'];
    onClose: ModalProps['onClose'];
    projectUuid: string;
    uuid: string;
    /** Original detail-query identifier when the app was loaded by slug. */
    appUuidOrSlug?: string;
    initialName: string;
    initialDescription: string;
    /** What the app is called to the user; chart types are apps too. */
    resourceLabel?: string;
    icon?: IconType;
    /** Shows the chart type icon picker beside the name; null hides it
     *  (plain data apps have no icon of their own). */
    iconPicker: { initialIcon: ChartTypeIcon | null } | null;
    onConfirm?: () => void;
}

const updateAppSchema = z.object({
    name: z.string().trim().min(1, { message: 'Name is required' }),
    description: z.string(),
    icon: chartTypeIconSchema.nullable(),
});

type FormState = z.infer<typeof updateAppSchema>;

const AppUpdateModal: FC<AppUpdateModalProps> = ({
    projectUuid,
    uuid,
    appUuidOrSlug,
    initialName,
    initialDescription,
    resourceLabel = 'Data App',
    icon = IconAppWindow,
    iconPicker,
    onConfirm,
    ...modalProps
}) => {
    const { mutateAsync, isLoading: isUpdating } = useUpdateApp({
        resourceLabel,
        appUuidOrSlug,
    });

    const initialIcon = iconPicker?.initialIcon ?? null;
    const form = useForm<FormState>({
        initialValues: {
            name: initialName,
            description: initialDescription,
            icon: initialIcon,
        },
        validate: zodResolver(updateAppSchema),
        validateInputOnChange: true,
    });

    const handleConfirm = form.onSubmit(async (data) => {
        const trimmedName = data.name.trim();
        const trimmedDescription = data.description.trim();
        const patch: {
            name?: string;
            description?: string;
            icon?: ChartTypeIcon | null;
        } = {};
        if (trimmedName !== initialName) patch.name = trimmedName;
        if (trimmedDescription !== initialDescription) {
            patch.description = trimmedDescription;
        }
        if (iconPicker !== null && data.icon !== initialIcon) {
            patch.icon = data.icon;
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
                    <Group align="flex-end" gap="xs" wrap="nowrap">
                        {iconPicker !== null && (
                            <ChartTypeIconPicker
                                value={form.values.icon}
                                onChange={(next) =>
                                    form.setFieldValue('icon', next)
                                }
                                disabled={isUpdating}
                            />
                        )}

                        <TextInput
                            label="Name"
                            required
                            flex={1}
                            placeholder="eg. Sales insights"
                            disabled={isUpdating}
                            {...form.getInputProps('name')}
                        />
                    </Group>

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
