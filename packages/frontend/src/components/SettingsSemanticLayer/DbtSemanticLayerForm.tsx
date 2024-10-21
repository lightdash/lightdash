import {
    SemanticLayerType,
    type DbtSemanticLayerConnection,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    Flex,
    Group,
    HoverCard,
    PasswordInput,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconHelp, IconTrash } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { z } from 'zod';
import MantineIcon from '../common/MantineIcon';

export const dbtSemanticLayerFormSchema = z.object({
    type: z.literal(SemanticLayerType.DBT),
    token: z.string(),
    domain: z
        .string()
        .url({ message: 'Domain must be a valid URL' })
        .min(1, 'Domain is required'),
    environmentId: z.string().min(1, 'Environment ID is required'),
});

// pre defined domains come from: https://docs.getdbt.com/docs/dbt-cloud-apis/sl-graphql#dbt-semantic-layer-graphql-api
const PRE_DEFINED_DOMAINS = [
    'https://semantic-layer.cloud.getdbt.com/api/graphql',
    'https://semantic-layer.emea.dbt.com/api/graphql',
    'https://semantic-layer.au.dbt.com/api/graphql',
];

type Props = {
    isLoading: boolean;
    semanticLayerConnection?: DbtSemanticLayerConnection;
    onSubmit: (data: z.infer<typeof dbtSemanticLayerFormSchema>) => void;
    onDelete: () => Promise<void>;
};

const DbtSemanticLayerForm: FC<Props> = ({
    isLoading,
    semanticLayerConnection,
    onSubmit,
    onDelete,
}) => {
    const theme = useMantineTheme();
    const form = useForm<z.infer<typeof dbtSemanticLayerFormSchema>>({
        validate: {
            ...zodResolver(dbtSemanticLayerFormSchema),
            // Custom validation for token since when there is no semanticLayerConnection it is required at the form level (there's also backend validation)
            token: (value) =>
                !semanticLayerConnection && value.length < 1
                    ? 'Token is required'
                    : null,
        },
        initialValues: {
            type: SemanticLayerType.DBT,
            token: '',
            domain: semanticLayerConnection?.domain ?? '',
            environmentId: semanticLayerConnection?.environmentId ?? '',
        },
    });

    const [domainOptions, setDomainOptions] = useState(
        // Remove duplicate entries if current domain is already part of PRE_DEFINED_DOMAINS
        Array.from(
            new Set(
                PRE_DEFINED_DOMAINS.concat(
                    semanticLayerConnection?.domain ?? [],
                ),
            ),
        ),
    );

    const handleDelete = useCallback(async () => {
        await onDelete();
        form.setInitialValues({
            type: SemanticLayerType.DBT,
            token: '',
            domain: '',
            environmentId: '',
        });
        form.reset();
    }, [form, onDelete]);

    return (
        <form onSubmit={form.onSubmit(onSubmit)}>
            <Stack>
                <PasswordInput
                    autoComplete="off"
                    {...form.getInputProps('token')}
                    placeholder={
                        semanticLayerConnection
                            ? '**************'
                            : 'Type the token to authenticate with the dbt API'
                    }
                    label={
                        <Group display="inline-flex" spacing="xs">
                            Service Token
                            <HoverCard
                                width={400}
                                withinPortal
                                position="top"
                                withArrow
                            >
                                <HoverCard.Target>
                                    <MantineIcon
                                        icon={IconHelp}
                                        color="gray.6"
                                    />
                                </HoverCard.Target>
                                <HoverCard.Dropdown
                                    style={{
                                        backgroundColor: theme.colors.dark[6],
                                    }}
                                >
                                    <Text color="white">
                                        Service tokens can be found in your dbt
                                        Cloud account settings:{' '}
                                        <Anchor
                                            href="https://cloud.getdbt.com/next/settings"
                                            target="_blank"
                                        >
                                            dbt Settings
                                        </Anchor>{' '}
                                        {'>'} API Tokens {'>'} Service Tokens -
                                        token needs at least{' '}
                                        <Text span fw={500}>
                                            'semantic layer only'
                                        </Text>{' '}
                                        permissions.
                                    </Text>
                                </HoverCard.Dropdown>
                            </HoverCard>
                        </Group>
                    }
                />

                <Select
                    label="Domain"
                    data={domainOptions}
                    {...form.getInputProps('domain')}
                    placeholder="Select or type domain"
                    searchable
                    creatable
                    getCreateLabel={(value) => `+ Add custom domain "${value}"`}
                    onCreate={(item) => {
                        setDomainOptions([...domainOptions, item]);
                        return item;
                    }}
                />

                <TextInput
                    {...form.getInputProps('environmentId')}
                    placeholder="Type your dbt Environment ID"
                    label={
                        <Group display="inline-flex" spacing="xs">
                            Environment ID
                            <Tooltip
                                maw={400}
                                label={
                                    <Text fw={400}>
                                        The unique identifier for the dbt
                                        production environment, you can retrieve
                                        this from the dbt Cloud URL when you
                                        navigate to Environments under Deploy.
                                        If your URL ends with
                                        .../environments/222222, your
                                        environmentId is 222222
                                    </Text>
                                }
                                multiline
                            >
                                <MantineIcon icon={IconHelp} color="gray.6" />
                            </Tooltip>
                        </Group>
                    }
                />

                <Flex justify="end" align="center" gap="sm">
                    <Button
                        type="submit"
                        disabled={!form.isValid()}
                        loading={isLoading}
                    >
                        Save
                    </Button>
                    <ActionIcon
                        variant="transparent"
                        onClick={handleDelete}
                        disabled={!Boolean(semanticLayerConnection)}
                        c="red"
                    >
                        <MantineIcon icon={IconTrash} size="md" />
                    </ActionIcon>
                </Flex>
            </Stack>
        </form>
    );
};

export default DbtSemanticLayerForm;
