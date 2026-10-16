import { type ApiError } from '@lightdash/common';
import { Button, Stack, Text, Textarea } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('settings');
    const aiUnavailable = error?.error.name === 'MissingConfigError';
    return (
        <Stack gap="sm" mt="xl">
            <Text c="dimmed" fz="sm">
                {t('dataAppConnections.wizard.automatic.intro')}
            </Text>
            <Textarea
                autosize
                minRows={3}
                maxRows={8}
                data-autofocus
                disabled={isLoading}
                placeholder={t(
                    'dataAppConnections.wizard.automatic.placeholder',
                )}
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
                <Text c="dimmed" fz="xs">
                    {t('dataAppConnections.wizard.automatic.loadingHint')}
                </Text>
            )}
            {aiUnavailable ? (
                <Callout
                    variant="info"
                    title={t(
                        'dataAppConnections.wizard.automatic.aiUnavailableTitle',
                    )}
                >
                    <Stack gap="xs" align="flex-start">
                        <Text fz="sm">
                            {t(
                                'dataAppConnections.wizard.automatic.aiUnavailableBody',
                            )}
                        </Text>
                        <Button
                            size="xs"
                            variant="default"
                            onClick={onSwitchToManual}
                        >
                            {t(
                                'dataAppConnections.wizard.automatic.setUpManually',
                            )}
                        </Button>
                    </Stack>
                </Callout>
            ) : (
                error && (
                    <Callout
                        variant="danger"
                        title={t(
                            'dataAppConnections.wizard.automatic.draftErrorTitle',
                        )}
                    >
                        {error.error.message}
                    </Callout>
                )
            )}
        </Stack>
    );
};
