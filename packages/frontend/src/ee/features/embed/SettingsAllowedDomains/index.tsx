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
    Tooltip,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useState, type FC } from 'react';
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

function getWildcardHint(domain: string): string | null {
    const trimmed = domain.trim();
    const match = trimmed.match(/^\*\.(.+)$/);
    if (!match) return null;
    const base = match[1];
    return `Matches any subdomain, e.g. app.${base}, staging.${base}`;
}

const AllowedDomainsPanel: FC = () => {
    const { data: domains, isLoading } = useOrganizationAllowedDomains();
    const addMutation = useAddOrganizationAllowedDomain();
    const deleteMutation = useDeleteOrganizationAllowedDomain();
    const [isAdding, setIsAdding] = useState(false);

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

    const wildcardHint = getWildcardHint(form.values.domain);

    const handleSubmit = form.onSubmit(async (values) => {
        await addMutation.mutateAsync({
            domain: values.domain.trim(),
            type: values.type,
        });
        form.reset();
        setIsAdding(false);
    });

    const handleCancel = () => {
        form.reset();
        setIsAdding(false);
    };

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

            {isAdding ? (
                <form onSubmit={handleSubmit}>
                    <Stack gap="xs">
                        <TextInput
                            label="Domain"
                            placeholder="https://app.example.com"
                            description={wildcardHint}
                            size="sm"
                            {...form.getInputProps('domain')}
                        />
                        <Select
                            label="Access type"
                            data={DOMAIN_TYPE_OPTIONS}
                            size="sm"
                            {...form.getInputProps('type')}
                        />
                        <Group justify="flex-end" gap="xs" mt="xs">
                            <Button
                                variant="subtle"
                                color="ldGray"
                                size="sm"
                                onClick={handleCancel}
                                leftSection={
                                    <MantineIcon icon={IconX} />
                                }
                            >
                                Cancel
                            </Button>
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
            ) : (
                <Group justify="flex-end">
                    <Button
                        variant="default"
                        size="sm"
                        onClick={() => setIsAdding(true)}
                        leftSection={<MantineIcon icon={IconPlus} />}
                    >
                        Add domain
                    </Button>
                </Group>
            )}
        </Stack>
    );
};

export default AllowedDomainsPanel;
