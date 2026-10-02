import { SemanticLayerFormat, type ApiError } from '@lightdash/common';
import { SegmentedControl, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import Callout from '../../common/Callout';
import { type SemanticLayerChoice } from './semanticLayerStepState';

const FORMAT_MESSAGES: Record<SemanticLayerFormat, string | null> = {
    [SemanticLayerFormat.DBT]: null,
    [SemanticLayerFormat.LIGHTDASH]: null,
    [SemanticLayerFormat.BOTH]:
        'This repository has both a dbt project and Lightdash YAML. Choose which one to use.',
    [SemanticLayerFormat.NEITHER]:
        'Found neither dbt_project.yml nor lightdash.config.yml at this path. Check the project path, or choose the format.',
};

export const FormatCheck: FC<{
    format: SemanticLayerFormat | undefined;
    error: ApiError | null;
    supportsNative: boolean;
    hostLabel: string;
    value: SemanticLayerChoice | null;
    onChange: (choice: SemanticLayerChoice) => void;
}> = ({ format, error, supportsNative, hostLabel, value, onChange }) => {
    const message = format ? FORMAT_MESSAGES[format] : null;
    const needsChoice =
        !!error ||
        format === SemanticLayerFormat.BOTH ||
        format === SemanticLayerFormat.NEITHER;
    const isNativeUnavailable =
        !supportsNative &&
        (value === 'lightdash' || format === SemanticLayerFormat.LIGHTDASH);
    if (!needsChoice && !isNativeUnavailable) {
        return null;
    }

    return (
        <Stack gap="xs">
            {message && <Text size="sm">{message}</Text>}
            {error && (
                <Callout variant="danger">
                    {error.error.message} Choose the format to continue.
                </Callout>
            )}
            {needsChoice && (
                <SegmentedControl
                    value={value ?? ''}
                    onChange={(choice) =>
                        onChange(choice === 'lightdash' ? 'lightdash' : 'dbt')
                    }
                    data={[
                        { value: 'dbt', label: 'dbt project' },
                        {
                            value: 'lightdash',
                            label: 'Lightdash YAML',
                            disabled: !supportsNative,
                        },
                    ]}
                />
            )}
            {isNativeUnavailable && (
                <Text size="sm" c="red">
                    Lightdash YAML is not available on {hostLabel} yet.
                </Text>
            )}
        </Stack>
    );
};
