import {
    EXTERNAL_CONNECTION_METHODS,
    type ExternalConnectionMethod,
} from '@lightdash/common';
import { Chip, Group, Stack, Text } from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';

const METHOD_OPTIONS: readonly ExternalConnectionMethod[] =
    EXTERNAL_CONNECTION_METHODS;

type Props = {
    label: string;
    value: ExternalConnectionMethod[];
    onChange: (value: ExternalConnectionMethod[]) => void;
    error?: ReactNode;
    disabled?: boolean;
};

/** Multi-select HTTP method chips. Shared by the onboarding wizard's
 *  Rules step and the Edit connection form. */
export const MethodsField: FC<Props> = ({
    label,
    value,
    onChange,
    error,
    disabled,
}) => (
    <Stack gap={4}>
        <Text fz="sm" fw={500}>
            {label}
        </Text>
        <Chip.Group
            multiple
            value={value}
            onChange={(next) => onChange(next as ExternalConnectionMethod[])}
        >
            <Group gap="xs" mt={4}>
                {METHOD_OPTIONS.map((method) => (
                    <Chip key={method} value={method} disabled={disabled}>
                        {method}
                    </Chip>
                ))}
            </Group>
        </Chip.Group>
        {error && (
            <Text c="red" fz="xs">
                {error}
            </Text>
        )}
    </Stack>
);
