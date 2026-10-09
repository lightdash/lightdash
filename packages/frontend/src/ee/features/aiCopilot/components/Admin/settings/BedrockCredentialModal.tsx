import {
    BEDROCK_REGIONS,
    getBedrockInferenceGeographiesForRegion,
    getDefaultBedrockInferenceGeography,
    type AiModelOption,
    type AiProviderCredential,
    type BedrockInferenceGeography,
} from '@lightdash/common';
import {
    Button,
    MultiSelect,
    PasswordInput,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { type FC } from 'react';
import { z } from 'zod';
import MantineModal from '../../../../../../components/common/MantineModal';
import { BEDROCK_GEOGRAPHY_LABELS } from './bedrockGeographyLabels';

const REGION_LABELS: Record<(typeof BEDROCK_REGIONS)[number], string> = {
    'ap-northeast-1': 'Asia Pacific (Tokyo)',
    'ap-northeast-3': 'Asia Pacific (Osaka)',
    'us-east-1': 'US East (N. Virginia)',
    'us-west-2': 'US West (Oregon)',
};

// The geography, not the region, decides where inference runs — the region
// only receives the request. Said next to the control so a compliance review
// can read the guarantee off the screen.
const GEOGRAPHY_NOTES: Record<BedrockInferenceGeography, string> = {
    jp: 'Requests stay in Japan (Tokyo and Osaka inference profiles).',
    us: 'Requests may be served by any US region.',
    eu: 'Requests may be served by any European region.',
    apac: 'Requests may be served by any Asia-Pacific region, across countries.',
    global: 'Requests may be served by any supported region worldwide.',
};

export type BedrockCredentialFormValues = {
    label: string;
    region: string;
    allowedModels: string[];
    apiKey?: string;
    inferenceGeography: BedrockInferenceGeography;
};

type Props = {
    opened: boolean;
    /** The credential being edited, or null when adding or replacing one. */
    credential: AiProviderCredential | null;
    /**
     * Repairing an unreadable row. Its stored config cannot be read, so every
     * field must be re-entered even though the credential already exists.
     */
    isReplacement?: boolean;
    models: AiModelOption[];
    isSaving: boolean;
    onClose: () => void;
    onSave: (values: BedrockCredentialFormValues) => void;
};

export const BedrockCredentialModal: FC<Props> = ({
    opened,
    credential,
    isReplacement = false,
    models,
    isSaving,
    onClose,
    onSave,
}) => {
    const form = useForm({
        initialValues: {
            label: credential?.label ?? '',
            apiKey: '',
            region: credential?.region ?? null,
            allowedModels: credential?.allowedModels ?? [],
            inferenceGeography: (credential?.inferenceGeography ??
                null) as BedrockInferenceGeography | null,
        },
        validate: zodResolver(
            z.object({
                label: z.string().trim().min(1, 'Enter a name'),
                // An existing credential keeps its stored key, so only a new
                // one needs a key typed in.
                apiKey: credential
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

    const geographyOptions =
        form.values.region === null
            ? []
            : getBedrockInferenceGeographiesForRegion(form.values.region);
    const effectiveGeography =
        form.values.inferenceGeography ??
        (form.values.region
            ? getDefaultBedrockInferenceGeography(form.values.region)
            : null);

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={
                isReplacement
                    ? 'Replace credential'
                    : credential
                      ? 'Edit credential'
                      : 'Add Bedrock credential'
            }
            actions={
                // MantineModal renders its own Cancel; only the submit goes here.
                <Button
                    type="submit"
                    form="bedrock-credential-form"
                    loading={isSaving}
                >
                    {isReplacement
                        ? 'Replace credential'
                        : credential
                          ? 'Save'
                          : 'Add credential'}
                </Button>
            }
        >
            <form
                id="bedrock-credential-form"
                onSubmit={form.onSubmit(
                    ({
                        label,
                        apiKey,
                        region,
                        allowedModels,
                        inferenceGeography,
                    }) => {
                        if (region === null) return;
                        onSave({
                            label: label.trim(),
                            region,
                            allowedModels,
                            // Always sent explicitly so what was reviewed is
                            // what is stored, never an implied default.
                            inferenceGeography:
                                inferenceGeography ??
                                getDefaultBedrockInferenceGeography(region),
                            ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
                        });
                    },
                )}
            >
                <Stack gap="sm">
                    <Text c="dimmed" fz="xs">
                        {isReplacement
                            ? 'The stored configuration cannot be read, so every field must be re-entered.'
                            : 'Use a Bedrock API key, not an AWS access key pair. The region you pick decides where inference runs, so enable these models in that region of your AWS account.'}
                    </Text>

                    <TextInput
                        label="Name"
                        placeholder="Japan (Tokyo)"
                        description="How projects refer to this credential."
                        {...form.getInputProps('label')}
                    />

                    <Select
                        label="AWS region"
                        placeholder="Select a region"
                        data={BEDROCK_REGIONS.map((value) => ({
                            value,
                            label: `${REGION_LABELS[value]} — ${value}`,
                        }))}
                        {...form.getInputProps('region')}
                        onChange={(value) => {
                            form.setFieldValue('region', value);
                            // The old geography may not exist in the new
                            // region; reset to its narrowest.
                            form.setFieldValue(
                                'inferenceGeography',
                                value
                                    ? getDefaultBedrockInferenceGeography(value)
                                    : null,
                            );
                        }}
                    />

                    <Select
                        label="Inference geography"
                        description="Where Amazon Bedrock may process requests — the region above only receives them."
                        placeholder={
                            form.values.region === null
                                ? 'Select a region first'
                                : undefined
                        }
                        disabled={form.values.region === null}
                        data={geographyOptions.map((geography) => ({
                            value: geography,
                            label: BEDROCK_GEOGRAPHY_LABELS[geography],
                        }))}
                        value={effectiveGeography}
                        onChange={(value) =>
                            form.setFieldValue(
                                'inferenceGeography',
                                value as BedrockInferenceGeography | null,
                            )
                        }
                    />
                    {effectiveGeography && (
                        <Text c="dimmed" fz="xs">
                            {GEOGRAPHY_NOTES[effectiveGeography]}
                        </Text>
                    )}

                    <PasswordInput
                        label="Bedrock API key"
                        autoComplete="new-password"
                        description={
                            credential
                                ? 'Leave blank to keep the saved key.'
                                : undefined
                        }
                        placeholder={
                            credential
                                ? credential.apiKeyHint
                                : 'ABSKQmVkcm9j...'
                        }
                        {...form.getInputProps('apiKey')}
                    />

                    <MultiSelect
                        label="Allowed models"
                        aria-label="Bedrock allowed models"
                        placeholder={
                            form.values.allowedModels.length > 0
                                ? undefined
                                : 'Select a model'
                        }
                        data={models.map((model) => ({
                            value: model.name,
                            label: model.displayName,
                        }))}
                        {...form.getInputProps('allowedModels')}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};
