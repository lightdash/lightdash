import { type AllowedDomainType } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Loader,
    Paper,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPlus, IconTrash } from '@tabler/icons-react';
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
        description: 'For embedding dashboards in your app using an iframe',
    },
    {
        value: 'sdk',
        label: 'SDK & API',
        description:
            'For connecting via the Lightdash SDK or making API requests',
    },
];

const TYPE_LABELS: Record<AllowedDomainType, string> = {
    embed: 'Embed (iframe)',
    sdk: 'SDK & API',
};

function getWildcardHint(domain: string): string | null {
    const trimmed = domain.trim();
    const match = trimmed.match(/(?:^|\*\.)([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)$/);
    if (!match || !trimmed.includes('*')) return null;
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
        <Stack gap="md">
            {domains && domains.length > 0 && (
                <Paper withBorder shadow="subtle" radius="md" style={{ overflow: 'hidden' }}>
                    {domains.map((domain, index) => (
                        <Group
                            key={domain.organizationAllowedDomainUuid}
                            justify="space-between"
                            wrap="nowrap"
                            gap="sm"
                            p="sm"
                            style={
                                index < domains.length - 1
                                    ? {
                                          borderBottom:
                                              '1px solid var(--mantine-color-default-border)',
                                      }
                                    : undefined
                            }
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
                </Paper>
            )}

            {isAdding ? (
                <form onSubmit={handleSubmit}>
                    <Stack gap={4}>
                        <TextInput
                            label="Domain"
                            placeholder="https://app.example.com"
                            description={wildcardHint}
                            size="xs"
                            {...form.getInputProps('domain')}
                        />
                        <Select
                            label="Access type"
                            data={DOMAIN_TYPE_OPTIONS}
                            size="xs"
                            renderOption={({ option }) => {
                                const desc =
                                    'description' in option
                                        ? String(option.description)
                                        : null;
                                return (
                                    <Stack gap={2}>
                                        <Text size="xs" fw={500}>
                                            {option.label}
                                        </Text>
                                        {desc && (
                                            <Text fz={10} c="dimmed">
                                                {desc}
                                            </Text>
                                        )}
                                    </Stack>
                                );
                            }}
                            {...form.getInputProps('type')}
                        />
                        <Group justify="flex-end" gap="xs" mt={4}>
                            <Button
                                variant="subtle"
                                color="ldGray"
                                size="xs"
                                onClick={handleCancel}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="default"
                                size="xs"
                                loading={addMutation.isLoading}
                            >
                                Add
                            </Button>
                        </Group>
                    </Stack>
                </form>
            ) : (
                <Group justify="flex-end">
                    <Button
                        variant="default"
                        size="xs"
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
