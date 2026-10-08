import type { AiAgentModelConfig, AiModelOption } from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import Callout from '../../../../components/common/Callout';
import type { ModelReplacement } from '../../../../components/common/ModelSelector/utils';

type Props = {
    model: AiModelOption;
    replacement: ModelReplacement | null;
    disabled: boolean;
    onSwitch: (modelConfig: AiAgentModelConfig) => void;
};

export const DeprecatedModelNotice: FC<Props> = ({
    model,
    replacement,
    disabled,
    onSwitch,
}) => (
    <Callout variant="warning" title={`${model.displayName} is retired`}>
        {replacement ? (
            <Stack gap="xs" align="flex-start">
                <Text fz="xs">
                    New chats already run on {replacement.model.displayName}.
                    Switch this setting so it matches the model that runs.
                </Text>
                <Button
                    size="compact-xs"
                    variant="default"
                    disabled={disabled}
                    onClick={() => onSwitch(replacement.modelConfig)}
                >
                    Switch to {replacement.model.displayName}
                </Button>
            </Stack>
        ) : (
            <Text fz="xs">
                No replacement is offered to your organization, so new chats
                still run on it. Pick another model to move off it.
            </Text>
        )}
    </Callout>
);
