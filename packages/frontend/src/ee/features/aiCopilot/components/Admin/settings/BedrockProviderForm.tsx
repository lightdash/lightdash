import {
    BEDROCK_REGIONS,
    type AiModelOption,
    type OrgBedrockConfig,
    type UpdateOrgBedrockConfig,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Group,
    MultiSelect,
    PasswordInput,
    Select,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconKey } from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { type FC } from 'react';
import { z } from 'zod';
import MantineIcon from '../../../../../../components/common/MantineIcon';

const REGION_LABELS: Record<(typeof BEDROCK_REGIONS)[number], string> = {
    'ap-northeast-1': 'Asia Pacific (Tokyo)',
    'ap-northeast-3': 'Asia Pacific (Osaka)',
    'us-east-1': 'US East (N. Virginia)',
    'us-west-2': 'US West (Oregon)',
};

// Japan routes to `jp` inference profiles, which stay in Tokyo and Osaka. US
// regions route to `us` profiles, which may serve from any US region.
const localityNote = (region: string | null): string | null => {
    if (region === null) return null;
    if (region === 'ap-northeast-1' || region === 'ap-northeast-3') {
        return 'Requests stay in Japan (Tokyo and Osaka inference profiles).';
    }
    return 'Requests may be served by any US region.';
};

type Props = {
    config: OrgBedrockConfig | null;
    hint: string | null;
    models: AiModelOption[];
    disabled: boolean;
    onSave: (value: UpdateOrgBedrockConfig) => void;
    onRemove: () => void;
};

export const BedrockProviderForm: FC<Props> = ({
    config,
    hint,
    models,
    disabled,
    onSave,
    onRemove,
}) => {
    const form = useForm({
        initialValues: {
            apiKey: '',
            region: config?.region ?? null,
            allowedModels: config?.allowedModels ?? [],
        },
        validate: zodResolver(
            z.object({
                // An existing config keeps its stored key, so only a new one
                // needs a key typed in.
                apiKey: config
                    ? z.string()
                    : z.string().trim().min(1, 'Enter a Bedrock API key'),
                region: z
                    .string()
                    .nullable()
                    .refine((value) => value !== null, 'Select an AWS region'),
                allowedModels: z
                    .array(z.string())
                    .min(1, 'Select at least one model'),
            }),
        ),
    });

    const locality = localityNote(form.values.region);

    return (
        <Box
            component="form"
            onSubmit={form.onSubmit(({ apiKey, region, allowedModels }) => {
                if (region === null) return;
                onSave({
                    region,
                    allowedModels,
                    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
                });
                form.setFieldValue('apiKey', '');
            })}
        >
            <Stack gap="xs">
                <Group gap="xs">
                    <Title order={6}>Amazon Bedrock</Title>
                    {config && (
                        <Badge
                            size="sm"
                            color="green"
                            leftSection={
                                <MantineIcon icon={IconKey} size={12} />
                            }
                        >
                            Active
                        </Badge>
                    )}
                </Group>
                <Text c="dimmed" fz="xs">
                    Use a Bedrock API key, not an AWS access key pair. The
                    region you pick decides where inference runs, so enable
                    these models in that region of your AWS account.
                </Text>

                <Select
                    size="xs"
                    label="AWS region"
                    placeholder="Select a region"
                    data={BEDROCK_REGIONS.map((value) => ({
                        value,
                        label: `${REGION_LABELS[value]} — ${value}`,
                    }))}
                    disabled={disabled}
                    {...form.getInputProps('region')}
                />
                {locality && (
                    <Text c="dimmed" fz="xs">
                        {locality}
                    </Text>
                )}

                <PasswordInput
                    size="xs"
                    label="Bedrock API key"
                    autoComplete="new-password"
                    description={
                        config
                            ? 'Leave blank to keep the saved key.'
                            : undefined
                    }
                    placeholder={
                        config
                            ? (hint ?? '••••••••••••••••')
                            : 'ABSKQmVkcm9j...'
                    }
                    disabled={disabled}
                    {...form.getInputProps('apiKey')}
                />

                <MultiSelect
                    size="xs"
                    label="Allowed models"
                    aria-label="Bedrock allowed models"
                    placeholder={
                        form.values.allowedModels.length > 0
                            ? undefined
                            : 'Select a model'
                    }
                    description="The first model selected becomes your organization's default."
                    data={models.map((model) => ({
                        value: model.name,
                        label: model.displayName,
                    }))}
                    disabled={disabled}
                    {...form.getInputProps('allowedModels')}
                />

                <Group gap="xs">
                    <Button
                        size="xs"
                        variant="default"
                        type="submit"
                        disabled={disabled}
                    >
                        {config ? 'Update' : 'Set configuration'}
                    </Button>
                    {config && (
                        <Button
                            size="xs"
                            variant="subtle"
                            color="red"
                            disabled={disabled}
                            onClick={() => {
                                form.setValues({
                                    apiKey: '',
                                    region: null,
                                    allowedModels: [],
                                });
                                form.resetDirty();
                                onRemove();
                            }}
                        >
                            Remove
                        </Button>
                    )}
                </Group>

                {config && (
                    <Text c="dimmed" fz="xs">
                        While Bedrock is set, Ask AI runs only on these models,
                        and verified-answer semantic search is unavailable
                        because it would send content to a provider outside this
                        region.
                    </Text>
                )}
            </Stack>
        </Box>
    );
};
