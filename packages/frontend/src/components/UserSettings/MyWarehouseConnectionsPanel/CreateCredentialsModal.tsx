import { WarehouseTypes } from '@lightdash/common';
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
import { FC, useState } from 'react';
import { CreateUserCredentials } from './types';
import { WarehouseFormInputs } from './WarehouseFormInputs';

type Props = Pick<ModalProps, 'opened' | 'onClose'>;

export const CreateCredentialsModal: FC<Props> = ({ opened, onClose }) => {
    const [userCredentialsType, setUserCredentialsType] = useState<
        WarehouseTypes | undefined
    >(undefined);
    const form = useForm<
        Pick<CreateUserCredentials, 'name'> & {
            credentials: CreateUserCredentials['credentials'] | undefined;
        }
    >({
        initialValues: {
            name: '',
            credentials: undefined,
        },
    });
    return (
        <Modal
            title={<Title order={4}>Add new credentials</Title>}
            opened={opened}
            onClose={onClose}
        >
            <Stack>
                <Stack spacing="xs">
                    <form
                        onSubmit={() =>
                            form.onSubmit((values) => {
                                // TODO: Save credentials to database
                                return values;
                            })
                        }
                    >
                        <TextInput required size="xs" label="Name" />

                        <Select
                            data={Object.values(WarehouseTypes).map((type) => ({
                                value: type,
                                label: type,
                            }))}
                            onChange={(value: WarehouseTypes | null) => {
                                if (value) setUserCredentialsType(value);
                            }}
                        />

                        {userCredentialsType && (
                            <WarehouseFormInputs
                                form={form}
                                userCredentialsType={userCredentialsType}
                            />
                        )}
                        <Group position="right" spacing="xs" mt="sm">
                            <Button
                                size="xs"
                                variant="outline"
                                color="dark"
                                onClick={onClose}
                            >
                                Cancel
                            </Button>

                            <Button size="xs" type="submit">
                                Save
                            </Button>
                        </Group>
                    </form>
                </Stack>
            </Stack>
        </Modal>
    );
};
