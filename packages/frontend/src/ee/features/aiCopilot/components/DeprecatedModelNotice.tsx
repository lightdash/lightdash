import type { AiModelOption } from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import Callout from '../../../../components/common/Callout';

type Props = {
    model: AiModelOption;
    replacement: AiModelOption;
    disabled: boolean;
    onSwitch: () => void;
};

export const DeprecatedModelNotice: FC<Props> = ({
    model,
    replacement,
    disabled,
    onSwitch,
}) => (
    <Callout variant="warning" title={`${model.displayName} is retired`}>
        <Stack gap="xs" align="flex-start">
            <Text fz="xs">
                New chats already run on {replacement.displayName}. Switch this
                setting so it matches the model that runs.
            </Text>
            <Button
                size="compact-xs"
                variant="light"
                color="yellow"
                disabled={disabled}
                onClick={onSwitch}
            >
                Switch to {replacement.displayName}
            </Button>
        </Stack>
    </Callout>
);
