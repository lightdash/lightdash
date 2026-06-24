import {
    ActionIcon,
    Button,
    Divider,
    Group,
    MultiSelect,
    NumberInput,
    PasswordInput,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { type UseFormReturnType } from '@mantine/form';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import { ExfilWarningCallout } from '../../../features/externalConnections/components/ExfilWarningCallout';
import MantineIcon from '../../common/MantineIcon';
import classes from './ExternalConnectionForm.module.css';

export type ExternalConnectionFormValues = {
    name: string;
    origin: string;
    type: 'none' | 'api_key' | 'bearer_token';
    secret: string;
    apiKeyName: string;
    apiKeyLocation: 'header' | 'query';
    allowedMethods: ('GET' | 'POST')[];
    allowedPathPrefixes: string[];
    allowedContentTypes: string[];
    responseMaxBytes: number;
    requestMaxBytes: number;
    timeoutMs: number;
    rateLimitPerMinute: number | null;
};

const CONTENT_TYPE_OPTIONS = [
    'application/json',
    'application/geo+json',
    'application/x-ndjson',
    'text/csv',
    'text/plain',
    'text/tab-separated-values',
];

type Props = {
    form: UseFormReturnType<ExternalConnectionFormValues>;
    disabled: boolean;
    /** When editing an existing connection that already has a stored secret,
     *  the secret field is left blank with a placeholder; blank = unchanged. */
    hasSecret: boolean;
};

export const ExternalConnectionForm: FC<Props> = ({
    form,
    disabled,
    hasSecret,
}) => {
    const { type, allowedMethods, origin } = form.values;
    const allowsPost = allowedMethods.includes('POST');
    const secretPlaceholder =
        hasSecret && type !== 'none'
            ? '•••• set (leave blank to keep current)'
            : undefined;

    return (
        <Stack gap="sm">
            <ExfilWarningCallout
                origin={origin}
                allowedMethods={allowedMethods}
            />

            <TextInput
                required
                label="Name"
                placeholder="My API"
                disabled={disabled}
                {...form.getInputProps('name')}
            />

            <TextInput
                required
                label="Origin"
                description="The remote base URL apps may call (must start with https://)"
                placeholder="https://api.example.com"
                disabled={disabled}
                {...form.getInputProps('origin')}
            />

            <Select
                label="Authentication"
                disabled={disabled}
                data={[
                    { value: 'none', label: 'None' },
                    { value: 'api_key', label: 'API key' },
                    { value: 'bearer_token', label: 'Bearer token' },
                ]}
                {...form.getInputProps('type')}
            />

            {type !== 'none' && (
                <PasswordInput
                    label={type === 'api_key' ? 'API key' : 'Bearer token'}
                    placeholder={secretPlaceholder}
                    disabled={disabled}
                    {...form.getInputProps('secret')}
                />
            )}

            {type === 'api_key' && (
                <Group grow align="flex-start">
                    <TextInput
                        required
                        label="API key name"
                        placeholder="X-Api-Key"
                        disabled={disabled}
                        {...form.getInputProps('apiKeyName')}
                    />
                    <Select
                        label="API key location"
                        disabled={disabled}
                        data={[
                            { value: 'header', label: 'Header' },
                            { value: 'query', label: 'Query parameter' },
                        ]}
                        {...form.getInputProps('apiKeyLocation')}
                    />
                </Group>
            )}

            <Divider label="Request policy" labelPosition="left" />

            <MultiSelect
                required
                label="Allowed methods"
                disabled={disabled}
                data={[
                    { value: 'GET', label: 'GET' },
                    { value: 'POST', label: 'POST' },
                ]}
                {...form.getInputProps('allowedMethods')}
            />

            <Stack gap={4}>
                <Text fz="sm" fw={500}>
                    Allowed path prefixes
                </Text>
                {form.values.allowedPathPrefixes.map((_prefix, index) => (
                    <div key={index} className={classes.pathPrefixRow}>
                        <TextInput
                            w="100%"
                            placeholder="/v1/"
                            disabled={disabled}
                            {...form.getInputProps(
                                `allowedPathPrefixes.${index}`,
                            )}
                        />
                        <ActionIcon
                            color="red"
                            variant="subtle"
                            disabled={disabled}
                            onClick={() =>
                                form.removeListItem(
                                    'allowedPathPrefixes',
                                    index,
                                )
                            }
                        >
                            <MantineIcon icon={IconTrash} />
                        </ActionIcon>
                    </div>
                ))}
                <Button
                    variant="subtle"
                    size="compact-sm"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    disabled={disabled}
                    onClick={() =>
                        form.insertListItem('allowedPathPrefixes', '')
                    }
                >
                    Add path prefix
                </Button>
            </Stack>

            <MultiSelect
                label="Allowed response content types"
                disabled={disabled}
                data={CONTENT_TYPE_OPTIONS}
                searchable
                {...form.getInputProps('allowedContentTypes')}
            />

            <Group grow align="flex-start">
                <NumberInput
                    label="Response max bytes"
                    min={0}
                    disabled={disabled}
                    {...form.getInputProps('responseMaxBytes')}
                />
                {allowsPost && (
                    <NumberInput
                        label="Request max bytes"
                        min={0}
                        disabled={disabled}
                        {...form.getInputProps('requestMaxBytes')}
                    />
                )}
            </Group>

            <Group grow align="flex-start">
                <NumberInput
                    label="Timeout (ms)"
                    min={0}
                    disabled={disabled}
                    {...form.getInputProps('timeoutMs')}
                />
                {allowsPost && (
                    <NumberInput
                        label="Rate limit (per minute)"
                        min={0}
                        disabled={disabled}
                        {...form.getInputProps('rateLimitPerMinute')}
                    />
                )}
            </Group>
        </Stack>
    );
};
