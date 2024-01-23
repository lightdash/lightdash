import {
    UpsertUserWarehouseCredentials,
    WarehouseTypes,
} from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    ModalProps,
    Select,
    Stack,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { FC } from 'react';
import { useUserWarehouseCredentialsCreateMutation } from '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import { getWarehouseLabel } from '../../ProjectConnection/ProjectConnectFlow/SelectWarehouse';
import { WarehouseFormInputs } from './WarehouseFormInputs';

type Props = Pick<ModalProps, 'opened' | 'onClose'>;

export const CreateCredentialsModal: FC<Props> = ({ opened, onClose }) => {
    const { mutateAsync, isLoading: isSaving } =
        useUserWarehouseCredentialsCreateMutation();
    const form = useForm<UpsertUserWarehouseCredentials>({
        initialValues: {
            name: '',
            credentials: {
                type: WarehouseTypes.POSTGRES,
                user: '',
                password: '',
            },
        },
    });
    return (
        <Modal
            title={<Title order={4}>Add new credentials</Title>}
            opened={opened}
            onClose={onClose}
        >
            <form
                onSubmit={form.onSubmit(async (formData) => {
                    await mutateAsync(formData);
                    onClose();
                })}
            >
                <Stack spacing="xs">
                    <TextInput
                        required
                        size="xs"
                        label="Name"
                        disabled={isSaving}
                        {...form.getInputProps('name')}
                    />

                    <Select
                        required
                        label="Warehouse"
                        size="xs"
                        disabled={isSaving}
                        data={Object.values(WarehouseTypes).map((type) => {
                            const isNotSupportedYet = [
                                WarehouseTypes.BIGQUERY,
                                WarehouseTypes.DATABRICKS,
                            ].includes(type);
                            return {
                                value: type,
                                label: `${getWarehouseLabel(type) || type} ${
                                    isNotSupportedYet ? ' (coming soon)' : ''
                                }`,
                                disabled: isNotSupportedYet,
                            };
                        })}
                        withinPortal
                        {...form.getInputProps('credentials.type')}
                    />

                    <WarehouseFormInputs form={form} disabled={isSaving} />

                    <Group position="right" spacing="xs" mt="sm">
                        <Button
                            size="xs"
                            variant="outline"
                            color="dark"
                            onClick={onClose}
                            disabled={isSaving}
                        >
                            Cancel
                        </Button>

                        <Button size="xs" type="submit" disabled={isSaving}>
                            Save
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};
