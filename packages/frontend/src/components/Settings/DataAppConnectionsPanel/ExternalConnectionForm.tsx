import { type ExternalConnectionMethod } from '@lightdash/common';
import {
    Divider,
    Group,
    MultiSelect,
    NumberInput,
    PasswordInput,
    Select,
    Stack,
    TextInput,
} from '@mantine-8/core';
import { type UseFormReturnType } from '@mantine/form';
import { type FC, useState } from 'react';
import { MethodsField } from '../../../features/externalConnections/components/MethodsField';
import { PathRulesField } from '../../../features/externalConnections/components/PathRulesField';
import {
    type PathMode,
    type PathPrefix,
} from '../../../features/externalConnections/utils/pathRules';
import FormCollapseButton from '../../ProjectConnection/FormCollapseButton';
import FormSection from '../../ProjectConnection/Inputs/FormSection';

export type ExternalConnectionFormValues = {
    name: string;
    origin: string;
    type: 'none' | 'api_key' | 'bearer_token';
    secret: string;
    apiKeyName: string;
    apiKeyLocation: 'header' | 'query';
    allowedMethods: ExternalConnectionMethod[];
    pathMode: PathMode;
    allowedPathPrefixes: PathPrefix[];
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
    const { type, allowedMethods } = form.values;
    const allowsPost = allowedMethods.includes('POST');
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const secretPlaceholder =
        hasSecret && type !== 'none'
            ? '•••• set (leave blank to keep current)'
            : undefined;

    return (
        <Stack gap="sm">
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

            <MethodsField
                label="Allowed methods"
                value={allowedMethods}
                onChange={(value) =>
                    form.setFieldValue('allowedMethods', value)
                }
                error={form.errors.allowedMethods}
                disabled={disabled}
            />

            <PathRulesField
                label="Allowed paths"
                mode={form.values.pathMode}
                onModeChange={(mode) => form.setFieldValue('pathMode', mode)}
                prefixes={form.values.allowedPathPrefixes}
                onPrefixesChange={(prefixes) =>
                    form.setFieldValue('allowedPathPrefixes', prefixes)
                }
                error={form.errors.allowedPathPrefixes}
                disabled={disabled}
            />

            <FormSection name="advanced" isOpen={isAdvancedOpen}>
                <Stack gap="sm" mt="xs">
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
            </FormSection>
            <FormCollapseButton
                isSectionOpen={isAdvancedOpen}
                onClick={() => setIsAdvancedOpen((open) => !open)}
            >
                Advanced settings
            </FormCollapseButton>
        </Stack>
    );
};
