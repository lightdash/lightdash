import { type ApiError } from '@lightdash/common';
import { Button, Stack, Text, Textarea } from '@mantine-8/core';
import { type FC } from 'react';
import Callout from '../../common/Callout';

type Props = {
    description: string;
    onDescriptionChange: (value: string) => void;
    onSubmit: () => void;
    isLoading: boolean;
    error: ApiError | null;
    onSwitchToManual: () => void;
};

export const AutomaticSetupStep: FC<Props> = ({
    description,
    onDescriptionChange,
    onSubmit,
    isLoading,
    error,
    onSwitchToManual,
}) => {
    const aiUnavailable = error?.error.name === 'MissingConfigError';
    return (
        <Stack gap="sm" mt="xl">
            <Text c="ldGray.6" fz="sm">
                Describe what you want to connect to and AI will prefill the
                connection — you review every step and paste the credential
                yourself.
            </Text>
            <Textarea
                autosize
                minRows={3}
                maxRows={8}
                data-autofocus
                disabled={isLoading}
                placeholder="I want to connect to Google Sheets to read spreadsheet data…"
                value={description}
                onChange={(event) =>
                    onDescriptionChange(event.currentTarget.value)
                }
                onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        onSubmit();
                    }
                }}
            />
            {isLoading && (
                <Text c="ldGray.6" fz="xs">
                    This usually takes about 15 seconds.
                </Text>
            )}
            {aiUnavailable ? (
                <Callout variant="info" title="AI isn't configured">
                    <Stack gap="xs" align="flex-start">
                        <Text fz="sm">
                            Your organization has no AI provider configured, so
                            the connection can't be drafted automatically. You
                            can still set it up manually.
                        </Text>
                        <Button
                            size="xs"
                            variant="default"
                            onClick={onSwitchToManual}
                        >
                            Set up manually
                        </Button>
                    </Stack>
                </Callout>
            ) : (
                error && (
                    <Callout
                        variant="danger"
                        title="Couldn't draft the connection"
                    >
                        {error.error.message}
                    </Callout>
                )
            )}
        </Stack>
    );
};
