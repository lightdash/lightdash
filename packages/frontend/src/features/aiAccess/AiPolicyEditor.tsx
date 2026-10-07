import {
    AiPrincipalKind,
    type AiWarehouseCapabilities,
    type UpsertAiAccessPolicy,
} from '@lightdash/common';
import { Stack, TextInput, Title } from '@mantine/core';
import { useOrganizationGroups } from '../../hooks/useOrganizationGroups';
import { AiGroupMappingsEditor } from './AiGroupMappingsEditor';
import { AiModeCards } from './AiModeCards';
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
    const groups = useOrganizationGroups({});
    return (
        <Stack>
            <Title order={5}>Separate principal</Title>
            <AiModeCards
                capabilities={capabilities}
                value={value.principalKind}
                onChange={(principalKind) => set({ principalKind })}
            />
            {value.principalKind === AiPrincipalKind.GROUP && (
                <AiGroupMappingsEditor
                    groups={(groups.data ?? []).map((group) => ({
                        value: group.uuid,
                        label: group.name,
                    }))}
                    value={value.groupMappings}
                    onChange={(groupMappings) => set({ groupMappings })}
                />
            )}
            {value.principalKind === AiPrincipalKind.SHARED && (
                <TextInput
                    label="Shared principal reference"
                    value={value.sharedRef ?? ''}
                    onChange={(event) =>
                        set({ sharedRef: event.currentTarget.value })
                    }
                />
            )}
            {value.principalKind === AiPrincipalKind.TWIN && (
                <TextInput
                    label="Person principal name template"
                    description="Use {email_local_part} for the part before @, or {user_uuid} for the person's unique ID."
                    value={value.twinNameTemplate ?? ''}
                    onChange={(event) =>
                        set({ twinNameTemplate: event.currentTarget.value })
                    }
                />
            )}
            <AiTransportEditor
                value={value}
                capabilities={capabilities}
                set={set}
            />
        </Stack>
    );
};
