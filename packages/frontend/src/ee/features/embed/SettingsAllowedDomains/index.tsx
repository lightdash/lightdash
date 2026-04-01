import { type AllowedDomainType } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Divider,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import {
    useAddOrganizationAllowedDomain,
    useDeleteOrganizationAllowedDomain,
    useOrganizationAllowedDomains,
} from './useOrganizationAllowedDomains';

const DOMAIN_TYPE_OPTIONS = [
    {
        value: 'embed',
        label: 'Iframe embed',
    },
    {
        value: 'sdk',
        label: 'SDK access',
    },
];

const AllowedDomainsPanel: FC = () => {
    const { data: domains, isLoading } = useOrganizationAllowedDomains();
    const addMutation = useAddOrganizationAllowedDomain();
    const deleteMutation = useDeleteOrganizationAllowedDomain();

    const form = useForm({
        initialValues: {
            domain: '',
            type: 'embed' as AllowedDomainType,
        },
        validate: {
            domain: (value) => {
                if (!value.trim()) return 'Domain is required';
                if (
                    !value.startsWith('https://') &&
                    !value.startsWith('http://localhost') &&
                    !value.startsWith('*.')
                ) {
                    return 'Must start with https://, http://localhost, or *.';
                }
                return null;
            },
        },
    });

    const handleSubmit = form.onSubmit(async (values) => {
        await addMutation.mutateAsync({
            domain: values.domain.trim(),
            type: values.type,
        });
        form.reset();
    });

    if (isLoading) {
        return <Loader size="sm" />;
    }

    return (
        <Stack gap="md">
            {domains && domains.length > 0 ? (
                <Stack gap="xs">
                    {domains.map((domain) => (
                        <Group
                            key={domain.organizationAllowedDomainUuid}
                            justify="space-between"
                            wrap="nowrap"
                            gap="sm"
                        >
                            <Text size="sm" fw={500} truncate maw="60%">
                                {domain.domain}
                            </Text>
                            <Group gap="xs" wrap="nowrap">
                                <Badge
                                    size="sm"
                                    variant="light"
                                    color={
                                        domain.type === 'embed'
                                            ? 'blue'
                                            : 'teal'
                                    }
                                >
                                    {domain.type === 'embed'
                                        ? 'Iframe embed'
                                        : 'SDK access'}
                                </Badge>
                                <Tooltip
                                    label="Remove domain"
                                    position="left"
                                >
                                    <ActionIcon
                                        variant="subtle"
                                        color="red"
                                        size="sm"
                                        loading={deleteMutation.isLoading}
                                        onClick={() =>
                                            deleteMutation.mutate(
                                                domain.organizationAllowedDomainUuid,
                                            )
                                        }
                                    >
                                        <MantineIcon icon={IconTrash} />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        </Group>
                    ))}
                </Stack>
            ) : (
                <Text size="sm" c="dimmed">
                    No custom domains configured. Domains from server
                    environment variables are always allowed.
                </Text>
            )}

            <Divider />

            <form onSubmit={handleSubmit}>
                <Stack gap="xs">
                    <Group gap="xs" align="flex-start" wrap="nowrap">
                        <TextInput
                            placeholder="https://app.example.com"
                            flex={1}
                            size="sm"
                            {...form.getInputProps('domain')}
                        />
                        <Select
                            data={DOMAIN_TYPE_OPTIONS}
                            w={140}
                            size="sm"
                            {...form.getInputProps('type')}
                        />
                    </Group>
                    <Button
                        type="submit"
                        variant="light"
                        size="sm"
                        loading={addMutation.isLoading}
                        leftSection={<MantineIcon icon={IconPlus} />}
                    >
                        Add domain
                    </Button>
                </Stack>
            </form>
        </Stack>
    );
};

export default AllowedDomainsPanel;
