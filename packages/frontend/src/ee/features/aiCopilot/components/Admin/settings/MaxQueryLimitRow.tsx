import {
    MAX_AI_MAX_QUERY_LIMIT,
    MIN_AI_MAX_QUERY_LIMIT,
} from '@lightdash/common';
import { Box, Flex, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { NumberInput } from '../../../../../../components/common/NumberInput';
import { useUpdateAiOrganizationSettings } from '../../../hooks/useAiOrganizationSettings';

export const MaxQueryLimitRow = ({
    current,
    instanceDefault,
}: {
    current: number | null;
    instanceDefault: number;
}) => {
    const { mutate: updateSettings, isLoading: isUpdatingSettings } =
        useUpdateAiOrganizationSettings();
    const [draft, setDraft] = useState<number | null | undefined>(undefined);

    const commit = () => {
        if (draft !== undefined && draft !== current) {
            updateSettings({ maxQueryLimit: draft });
        }
        setDraft(undefined);
    };

    return (
        <Flex
            justify="space-between"
            direction={{ base: 'column', sm: 'row' }}
            align="flex-start"
            gap="md"
        >
            <Box maw={620}>
                <Title order={5} mb={4}>
                    Max rows per query
                </Title>
                <Text c="dimmed" fz="xs">
                    Caps how many rows each query an agent runs can return. The
                    agent only reads a sample of the result; the full set feeds
                    its charts, tables and exports. A higher cap lets it analyse
                    more data per question. Leave empty to use the instance
                    default of {instanceDefault.toLocaleString()}.
                </Text>
            </Box>
            <NumberInput
                w={{ base: '100%', sm: 160 }}
                size="xs"
                aria-label="Max rows per query"
                min={MIN_AI_MAX_QUERY_LIMIT}
                max={MAX_AI_MAX_QUERY_LIMIT}
                thousandSeparator=","
                disabled={isUpdatingSettings}
                value={draft === undefined ? (current ?? '') : (draft ?? '')}
                placeholder={instanceDefault.toLocaleString()}
                onNumberChange={(value) => setDraft(value ?? null)}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        commit();
                    }
                }}
            />
        </Flex>
    );
};
