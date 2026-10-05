import {
    DEFAULT_AI_TWIN_NAME_TEMPLATE,
    SNOWFLAKE_LOGIN_PLACEHOLDER,
    type AiIdentitySettings,
} from '@lightdash/common';
import { Button, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { useUpdateAiIdentitySettings } from '../../hooks/useAiIdentities';
export const AiTwinNamingStep = ({
    projectUuid,
    settings,
}: {
    projectUuid: string;
    settings: AiIdentitySettings;
}) => {
    const [input, setInput] = useState<string | null>(null);
    const template =
        input ?? settings.twinNameTemplate ?? DEFAULT_AI_TWIN_NAME_TEMPLATE;
    const save = useUpdateAiIdentitySettings(projectUuid);
    const valid = template.includes(SNOWFLAKE_LOGIN_PLACEHOLDER);
    return (
        <Stack gap="sm">
            <Text fz="sm">
                Each person gets their own Snowflake AI user. It has their
                access minus PII. Lightdash holds its private key; you set the
                public key in Snowflake.
            </Text>
            <TextInput
                label="Naming template"
                value={template}
                onChange={(event) => setInput(event.currentTarget.value)}
                error={
                    valid
                        ? undefined
                        : 'Include {snowflake_login} in the template.'
                }
            />
            <Button
                size="xs"
                loading={save.isLoading}
                disabled={!valid}
                onClick={() => save.mutate({ twinNameTemplate: template })}
            >
                Save naming template
            </Button>
            {save.error && (
                <Text c="red" fz="sm">
                    {save.error.error.message}
                </Text>
            )}
            {save.isSuccess && <Text fz="sm">Naming template saved.</Text>}
        </Stack>
    );
};
