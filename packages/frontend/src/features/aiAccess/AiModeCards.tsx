import {
    AiPrincipalKind,
    type AiWarehouseCapabilities,
} from '@lightdash/common';
import { Radio, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';
import classes from './AiAccessPage.module.css';
const modes = [
    {
        kind: AiPrincipalKind.GROUP,
        title: 'Group',
        description: 'Use a warehouse principal for each mapped group.',
        admin: 'Admin: create each group principal and grant its access.',
        person: 'Person: use the principal mapped to their group.',
    },
    {
        kind: AiPrincipalKind.TWIN,
        title: 'Twin',
        description: 'Give each person a separate warehouse principal for AI.',
        admin: 'Admin: create each twin and grant its access.',
        person: 'Person: use their assigned twin.',
    },
    {
        kind: AiPrincipalKind.SHARED,
        title: 'Shared',
        description: 'Use one warehouse principal for everyone using AI.',
        admin: 'Admin: create the shared principal and grant its access.',
        person: 'Person: nothing to do.',
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
}) => (
    <Radio.Group
        label="AI principal mode"
        value={value}
        onChange={(kind) => {
            if (capabilities.principals[kind as AiPrincipalKind].available)
                onChange(kind as AiPrincipalKind);
        }}
    >
        <SimpleGrid cols={{ base: 1, sm: 2 }} mt="sm">
            {modes.map(({ kind, title, description, admin, person }) => {
                const capability = capabilities.principals[kind];
                return (
                    <Tooltip
                        key={kind}
                        disabled={capability.available}
                        label={capability.available ? '' : capability.reason}
                        multiline
                        maw={350}
                    >
                        <Stack
                            className={classes.mode}
                            data-unavailable={!capability.available}
                            gap="xs"
                        >
                            <Radio
                                value={kind}
                                label={title}
                                disabled={!capability.available}
                            />
                            <Text size="sm">{description}</Text>
                            <Text size="sm">{admin}</Text>
                            <Text size="sm">{person}</Text>
                            {!capability.available && (
                                <Text size="xs" c="dimmed">
                                    {capability.reason}
                                </Text>
                            )}
                        </Stack>
                    </Tooltip>
                );
            })}
        </SimpleGrid>
    </Radio.Group>
);
