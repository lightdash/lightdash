import {
    type AiWarehouseCapabilities,
    type UpsertAiAccessPolicy,
} from '@lightdash/common';
import { Stack, TextInput } from '@mantine/core';
import { AiTransportEditor } from './AiTransportEditor';
export const AiPolicyEditor = ({
    value,
    capabilities,
    set,
}: {
    value: UpsertAiAccessPolicy;
    capabilities: AiWarehouseCapabilities;
    set: (patch: Partial<UpsertAiAccessPolicy>) => void;
}) => {
    return (
        <Stack>
            <TextInput
                label="Principal reference"
                description="The warehouse role or user agents sign in as."
                value={value.sharedRef ?? ''}
                onChange={(event) =>
                    set({ sharedRef: event.currentTarget.value })
                }
            />
            <AiTransportEditor
                value={value}
                capabilities={capabilities}
                set={set}
            />
        </Stack>
    );
};
