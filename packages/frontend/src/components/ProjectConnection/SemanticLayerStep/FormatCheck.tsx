import {
    SemanticLayerFormat,
    type GitHostCredentials,
} from '@lightdash/common';
import { Button, SegmentedControl, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useSemanticLayerFormat } from '../../../hooks/useGitHostDiscovery';
import { type RepositorySelection } from './semanticLayerStepState';

export type SemanticLayerChoice = 'dbt' | 'lightdash';

const FORMAT_MESSAGES: Record<SemanticLayerFormat, string> = {
    [SemanticLayerFormat.DBT]: 'Found a dbt project.',
    [SemanticLayerFormat.LIGHTDASH]: 'Found Lightdash YAML.',
    [SemanticLayerFormat.BOTH]:
        'Found both a dbt project and Lightdash YAML. Choose which one to use.',
    [SemanticLayerFormat.NEITHER]:
        'Found neither dbt_project.yml nor lightdash.config.yml at this path. Check the project path, or choose the format.',
};

const AUTOMATIC_CHOICE: Record<
    SemanticLayerFormat,
    SemanticLayerChoice | null
> = {
    [SemanticLayerFormat.DBT]: 'dbt',
    [SemanticLayerFormat.LIGHTDASH]: 'lightdash',
    [SemanticLayerFormat.BOTH]: null,
    [SemanticLayerFormat.NEITHER]: null,
};

export const FormatCheck: FC<{
    credentials: GitHostCredentials | null;
    selection: RepositorySelection;
    supportsNative: boolean;
    hostLabel: string;
    value: SemanticLayerChoice | null;
    onChange: (choice: SemanticLayerChoice | null) => void;
}> = ({
    credentials,
    selection,
    supportsNative,
    hostLabel,
    value,
    onChange,
}) => {
    const detection = useSemanticLayerFormat();
    const { repository } = selection;
    const canCheck = !!credentials && !!repository && !!selection.branch;
    const needsChoice =
        detection.isError ||
        detection.data === SemanticLayerFormat.BOTH ||
        detection.data === SemanticLayerFormat.NEITHER;

    const check = () => {
        if (!credentials || !repository) return;
        detection.mutate(
            {
                credentials,
                repository,
                branch: selection.branch,
                subPath: selection.subPath,
            },
            {
                onSuccess: (format) => onChange(AUTOMATIC_CHOICE[format]),
                onError: () => onChange(null),
            },
        );
    };

    return (
        <Stack gap="xs">
            <Button
                variant="default"
                w="fit-content"
                disabled={!canCheck}
                loading={detection.isLoading}
                onClick={check}
            >
                Check the repository
            </Button>
            {detection.data && (
                <Text size="sm">{FORMAT_MESSAGES[detection.data]}</Text>
            )}
            {detection.error && (
                <Text size="sm" c="red">
                    {detection.error.error.message}
                </Text>
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
            {value === 'lightdash' && !supportsNative && (
                <Text size="sm" c="red">
                    Lightdash YAML is not available on {hostLabel} yet.
                </Text>
            )}
        </Stack>
    );
};
