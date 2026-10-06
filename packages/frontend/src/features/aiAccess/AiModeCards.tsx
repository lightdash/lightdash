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
    },
    {
        kind: AiPrincipalKind.PERSON,
        title: 'Person',
        description: 'Run as the person through a separate AI sign-in.',
    },
    {
        kind: AiPrincipalKind.TWIN,
        title: 'Twin',
        description: 'Give each person a separate warehouse principal for AI.',
    },
    {
        kind: AiPrincipalKind.SHARED,
        title: 'Shared',
        description: 'Use one warehouse principal for everyone using AI.',
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
            {modes.map(({ kind, title, description }) => {
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
