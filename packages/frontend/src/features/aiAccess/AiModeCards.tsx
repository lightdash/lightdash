import {
    AiPrincipalKind,
    type AiWarehouseCapabilities,
} from '@lightdash/common';
import { SegmentedControl, Stack, Text } from '@mantine/core';
const modes = [
    {
        kind: AiPrincipalKind.GROUP,
        title: 'Per group',
        description: 'One principal for each mapped group.',
    },
    {
        kind: AiPrincipalKind.TWIN,
        title: 'Per person',
        description: 'One principal for each person.',
    },
    {
        kind: AiPrincipalKind.SHARED,
        title: 'One shared',
        description: 'One principal for every agent query.',
    },
];
export const AiModeCards = ({
    capabilities,
    value,
    onChange,
}: {
    capabilities: AiWarehouseCapabilities;
    value: AiPrincipalKind;
    onChange: (kind: AiPrincipalKind) => void;
}) => {
    const capability = capabilities.principals[value];
    return (
        <Stack gap="xs">
            <SegmentedControl
                aria-label="Separate principal"
                value={value}
                data={modes.map(({ kind, title }) => ({
                    value: kind,
                    label: title,
                    disabled: !capabilities.principals[kind].available,
                }))}
                onChange={(kind) => {
                    const mode = modes.find((item) => item.kind === kind);
                    if (mode && capabilities.principals[mode.kind].available)
                        onChange(mode.kind);
                }}
            />
            <Text size="sm" c="dimmed">
                {modes.find((mode) => mode.kind === value)?.description}
            </Text>
            {!capability.available && (
                <Text size="sm" c="dimmed">
                    {capability.reason}
                </Text>
            )}
        </Stack>
    );
};
