import {
    Button,
    Modal,
    MultiSelect,
    Select,
    Stack,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { addDays } from 'date-fns';
import { type FC } from 'react';

import { ServiceAccountScope } from '@lightdash/common';

const AVAILABLE_SCOPES = Object.values(ServiceAccountScope)
    .map((scope) => ({
        label: scope,
        value: scope,
        group: scope.split(':')[0],
    }))
    .filter((scope) => scope.group !== 'scim');

const expireOptions = [
    {
        label: 'No expiration',
        value: '',
    },
    {
        label: '7 days',
        value: '7',
    },
    {
        label: '30 days',
        value: '30',
    },
    {
        label: '60 days',
        value: '60',
    },
    {
        label: '90 days',
        value: '90',
    },
    {
        label: '6 months',
        value: '180',
    },
    {
        label: '1 year',
        value: '365',
    },
];

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onSave: (values: any) => void;
    isWorking: boolean;
};

export const ServiceAccountsCreateModal: FC<Props> = ({
    isOpen,
    onClose,
    onSave,
    isWorking,
}) => {
    const form = useForm({
        initialValues: {
            description: '',
            expiresAt: '',
            scopes: [] as ServiceAccountScope[],
        },
        transformValues: (values) => {
            return {
                ...values,
                expiresAt:
                    values.expiresAt === '' ? null : Number(values.expiresAt),
            };
        },
        validate: {
            scopes: (value) => {
                if (value.length === 0) {
                    return 'At least one scope is required';
                }
                return null;
            },
        },
    });

    const closeModal = () => {
        form.reset();
        onClose();
    };

    const handleOnSubmit = form.onSubmit(({ expiresAt, ...values }) => {
        onSave({
            ...values,
            expiresAt: expiresAt ? addDays(new Date(), expiresAt) : expiresAt,
        });
        closeModal();
    });

    return (
        <Modal
            opened={isOpen}
            onClose={closeModal}
            title="New Service Account"
            styles={(theme) => ({
                title: { fontWeight: 'bold', fontSize: theme.fontSizes.lg },
            })}
        >
            <form onSubmit={handleOnSubmit}>
                <Stack spacing="md">
                    <TextInput
                        label="Description"
                        placeholder="What's this service account for?"
                        required
                        disabled={isWorking}
                        {...form.getInputProps('description')}
                    />
                    <Select
                        withinPortal
                        defaultValue={expireOptions[0].value}
                        label="Expiration"
                        data={expireOptions}
                        disabled={isWorking}
                        {...form.getInputProps('expiresAt')}
                    ></Select>
                    <MultiSelect
                        label="Scopes"
                        placeholder="Select scopes"
                        data={AVAILABLE_SCOPES}
                        required
                        searchable
                        maxDropdownHeight={140}
                        disabled={isWorking}
                        {...form.getInputProps('scopes')}
                    />

                    <Button type="submit" ml="auto" loading={isWorking}>
                        Create service account
                    </Button>
                </Stack>
            </form>
        </Modal>
    );
};
