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
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import MantineModal from '../../../../../../components/common/MantineModal';
import { BEDROCK_GEOGRAPHY_LABELS } from './bedrockGeographyLabels';

const REGION_LABEL_KEYS: Record<(typeof BEDROCK_REGIONS)[number], string> = {
    'ap-northeast-1': 'settings.bedrockModal.regions.apNortheast1',
    'ap-northeast-3': 'settings.bedrockModal.regions.apNortheast3',
    'eu-central-1': 'settings.bedrockModal.regions.euCentral1',
    'eu-west-1': 'settings.bedrockModal.regions.euWest1',
    'us-east-1': 'settings.bedrockModal.regions.usEast1',
    'us-west-2': 'settings.bedrockModal.regions.usWest2',
};

// The geography, not the region, decides where inference runs — the region
// only receives the request. Said next to the control so a compliance review
// can read the guarantee off the screen.
const GEOGRAPHY_NOTE_KEYS: Record<BedrockInferenceGeography, string> = {
    jp: 'settings.bedrockModal.geographyNotes.jp',
    us: 'settings.bedrockModal.geographyNotes.us',
    eu: 'settings.bedrockModal.geographyNotes.eu',
    apac: 'settings.bedrockModal.geographyNotes.apac',
    global: 'settings.bedrockModal.geographyNotes.global',
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
    const { t } = useTranslation('aiCopilotAdmin');
    const validationSchema = useMemo(
        () =>
            z.object({
                label: z
                    .string()
                    .trim()
                    .min(1, t('settings.bedrockModal.validation.name')),
                // An existing credential keeps its stored key, so only a new
                // one needs a key typed in.
                apiKey: credential
                    ? z.string()
                    : z
                          .string()
                          .trim()
                          .min(1, t('settings.bedrockModal.validation.apiKey')),
                region: z
                    .string()
                    .nullable()
                    .refine(
                        (value) => value !== null,
                        t('settings.bedrockModal.validation.region'),
                    ),
                allowedModels: z
                    .array(z.string())
                    .min(1, t('settings.bedrockModal.validation.models')),
            }),
        [credential, t],
    );
    const form = useForm({
        initialValues: {
            label: credential?.label ?? '',
            apiKey: '',
            region: credential?.region ?? null,
            allowedModels: credential?.allowedModels ?? [],
            inferenceGeography: (credential?.inferenceGeography ??
                null) as BedrockInferenceGeography | null,
        },
        validate: zodResolver(validationSchema),
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
                    ? t('settings.bedrockModal.replaceTitle')
                    : credential
                      ? t('settings.bedrockModal.editTitle')
                      : t('settings.bedrockModal.addTitle')
            }
            actions={
                // MantineModal renders its own Cancel; only the submit goes here.
                <Button
                    type="submit"
                    form="bedrock-credential-form"
                    loading={isSaving}
                >
                    {isReplacement
                        ? t('settings.bedrockModal.replaceTitle')
                        : credential
                          ? t('actions.save', { ns: 'common' })
                          : t('settings.bedrockModal.addCredential')}
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
                            ? t('settings.bedrockModal.replaceNote')
                            : t('settings.bedrockModal.intro')}
                    </Text>

                    <TextInput
                        label={t('settings.bedrockModal.name')}
                        placeholder={t('settings.bedrockModal.namePlaceholder')}
                        description={t('settings.bedrockModal.nameDescription')}
                        {...form.getInputProps('label')}
                    />

                    <Select
                        label={t('settings.bedrockModal.region')}
                        placeholder={t('settings.bedrockModal.selectRegion')}
                        data={BEDROCK_REGIONS.map((value) => ({
                            value,
                            label: t('settings.bedrockModal.regionOption', {
                                label: t(REGION_LABEL_KEYS[value]),
                                value,
                            }),
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
                        label={t('settings.bedrockModal.geography')}
                        description={t(
                            'settings.bedrockModal.geographyDescription',
                        )}
                        placeholder={
                            form.values.region === null
                                ? t('settings.bedrockModal.selectRegionFirst')
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
                            {t(GEOGRAPHY_NOTE_KEYS[effectiveGeography])}
                        </Text>
                    )}

                    <PasswordInput
                        label={t('settings.bedrockModal.apiKey')}
                        autoComplete="new-password"
                        description={
                            credential
                                ? t('settings.bedrockModal.keepKey')
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
                        label={t('settings.bedrockModal.allowedModels')}
                        aria-label={t(
                            'settings.bedrockModal.allowedModelsAria',
                        )}
                        placeholder={
                            form.values.allowedModels.length > 0
                                ? undefined
                                : t('settings.bedrockModal.selectModel')
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
