import { type AllowedDomainType } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
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
        label: 'Embed (iframe)',
        description: 'Embeds Lightdash dashboards in an iframe',
    },
    {
        value: 'sdk',
        label: 'SDK & API',
        description: 'Connects to Lightdash via the SDK or API',
    },
];

const TYPE_LABELS: Record<AllowedDomainType, string> = {
    embed: 'Embed (iframe)',
    sdk: 'SDK & API',
};

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
        <Stack gap="lg">
            <Stack gap="xs" mt="md">
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
                                        {TYPE_LABELS[domain.type]}
                                    </Badge>
                                    <Tooltip
                                        label="Remove domain"
                                        position="left"
                                    >
                                        <ActionIcon
                                            variant="subtle"
                                            color="red"
                                            size="sm"
                                            loading={
                                                deleteMutation.isLoading
                                            }
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
            </Stack>

            <Stack gap="xs">
                <Title order={6}>New domain</Title>
                <form onSubmit={handleSubmit}>
                    <Stack gap="xs">
                        <TextInput
                            label="Domain"
                            placeholder="https://app.example.com"
                            size="sm"
                            {...form.getInputProps('domain')}
                        />
                        <Select
                            label="Access type"
                            data={DOMAIN_TYPE_OPTIONS}
                            size="sm"
                            {...form.getInputProps('type')}
                        />
                        <Group justify="flex-end" mt="xs">
                            <Button
                                type="submit"
                                variant="default"
                                size="sm"
                                loading={addMutation.isLoading}
                                leftSection={
                                    <MantineIcon icon={IconPlus} />
                                }
                            >
                                Add domain
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Stack>
        </Stack>
    );
};

export default AllowedDomainsPanel;
