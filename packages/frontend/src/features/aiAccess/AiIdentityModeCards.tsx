import {
    WarehouseTypes,
    type AiWarehouseCapabilities,
} from '@lightdash/common';
import { Group, Radio, SimpleGrid, Stack, Text } from '@mantine/core';

export const AiIdentityModeCards = ({
    capabilities,
    separate,
    onChange,
    disabled,
}: {
    capabilities: AiWarehouseCapabilities;
    separate: boolean;
    onChange: (separate: boolean) => void;
    disabled: boolean;
}) => {
    const person = capabilities.principals.person;
    const shared = capabilities.principals.shared;
    return (
        <Radio.Group
            aria-label="Identity"
            value={separate ? 'principal' : 'marked_person'}
            onChange={(value) => onChange(value === 'principal')}
        >
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <Radio.Card
                    value="marked_person"
                    aria-label="Marked person"
                    disabled={disabled || !person.available}
                    p="md"
                    radius="md"
                >
                    <Stack gap="xs">
                        <Group>
                            <Radio.Indicator
                                disabled={disabled || !person.available}
                            />
                            <Text fw={500}>Marked person</Text>
                        </Group>
                        <Text size="sm" c="dimmed">
                            Agents use each person's own warehouse access. Every
                            query is marked.
                        </Text>
                        {capabilities.warehouseType ===
                            WarehouseTypes.SNOWFLAKE && (
                            <Text size="sm" c="dimmed">
                                Each person signs in once to start verified
                                agent sessions.
                            </Text>
                        )}
                        {!person.available && (
                            <Text size="sm" c="dimmed">
                                {person.reason}
                            </Text>
                        )}
                    </Stack>
                </Radio.Card>
                <Radio.Card
                    value="principal"
                    aria-label="Separate principal"
                    opacity={shared.available ? 1 : 0.5}
                    disabled={disabled || !shared.available}
                    p="md"
                    radius="md"
                >
                    <Stack gap="xs">
                        <Group>
                            <Radio.Indicator
                                disabled={disabled || !shared.available}
                            />
                            <Text fw={500}>Separate principal</Text>
                        </Group>
                        <Text size="sm" c="dimmed">
                            Agents use one warehouse principal for every agent
                            query. Use this when the marker cannot enforce your
                            rules.
                        </Text>
                        {!shared.available && (
                            <Text size="sm" c="dimmed">
                                {shared.reason}
                            </Text>
                        )}
                    </Stack>
                </Radio.Card>
            </SimpleGrid>
        </Radio.Group>
    );
};
