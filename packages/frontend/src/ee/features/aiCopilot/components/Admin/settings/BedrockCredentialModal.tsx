import {
    BEDROCK_REGIONS,
    type AiModelOption,
    type AiProviderCredential,
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

export type BedrockCredentialFormValues = {
    label: string;
    region: string;
    allowedModels: string[];
    apiKey?: string;
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

    const locality = localityNote(form.values.region);

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
                <>
                    <Button variant="default" onClick={onClose}>
                        Cancel
                    </Button>
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
                </>
            }
        >
            <form
                id="bedrock-credential-form"
                onSubmit={form.onSubmit(
                    ({ label, apiKey, region, allowedModels }) => {
                        if (region === null) return;
                        onSave({
                            label: label.trim(),
                            region,
                            allowedModels,
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
                    />
                    {locality && (
                        <Text c="dimmed" fz="xs">
                            {locality}
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
