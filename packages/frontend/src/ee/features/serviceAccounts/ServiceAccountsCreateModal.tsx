import { ServiceAccountScope } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    CopyButton,
    MultiSelect,
    Select,
    Stack,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconCheck, IconCopy, IconKey } from '@tabler/icons-react';
import { addDays } from 'date-fns';
import { type FC } from 'react';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';

const AVAILABLE_SCOPES = Object.values(ServiceAccountScope)
    .filter((scope) => !scope.startsWith('scim:'))
    .reduce<{ group: string; items: string[] }[]>((acc, scope) => {
        const group = scope.split(':')[0];
        const existingGroup = acc.find((g) => g.group === group);
        if (existingGroup) {
            existingGroup.items.push(scope);
        } else {
            acc.push({ group, items: [scope] });
        }
        return acc;
    }, []);

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
    token?: string;
};

export const ServiceAccountsCreateModal: FC<Props> = ({
    isOpen,
    onClose,
    onSave,
    isWorking,
    token,
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
    });

    return (
        <MantineModal
            opened={isOpen}
            onClose={closeModal}
            title="New Service Account"
            icon={IconKey}
            cancelLabel={token ? false : 'Cancel'}
            cancelDisabled={isWorking}
            actions={
                !token ? (
                    <Button
                        type="submit"
                        form="create-service-account-form"
                        loading={isWorking}
                    >
                        Create service account
                    </Button>
                ) : (
                    <Button onClick={closeModal}>Done</Button>
                )
            }
        >
            {!token ? (
                <form
                    id="create-service-account-form"
                    onSubmit={handleOnSubmit}
                >
                    <Stack gap="md">
                        <TextInput
                            label="Description"
                            placeholder="What's this service account for?"
                            required
                            disabled={isWorking}
                            {...form.getInputProps('description')}
                        />
                        <Select
                            defaultValue={expireOptions[0].value}
                            label="Expiration"
                            data={expireOptions}
                            disabled={isWorking}
                            {...form.getInputProps('expiresAt')}
                        />
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
                    </Stack>
                </form>
            ) : (
                <Stack>
                    <TextInput
                        label="Token"
                        readOnly
                        className="sentry-block ph-no-capture"
                        value={token}
                        rightSection={
                            <CopyButton value={token}>
                                {({ copied, copy }) => (
                                    <Tooltip
                                        label={copied ? 'Copied' : 'Copy'}
                                        withArrow
                                        position="right"
                                    >
                                        <ActionIcon
                                            color={copied ? 'teal' : 'gray'}
                                            onClick={copy}
                                        >
                                            <MantineIcon
                                                icon={
                                                    copied
                                                        ? IconCheck
                                                        : IconCopy
                                                }
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                )}
                            </CopyButton>
                        }
                    />
                    <Callout
                        variant="info"
                        title="Make sure to copy your access token now. You won't be able to see it again!"
                    />
                </Stack>
            )}
        </MantineModal>
    );
};
