import { type ExternalConnectionMethod } from '@lightdash/common';
import { Chip, Group, Stack, Text } from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';

// Extend here when the backend's supported-method set grows (e.g. PATCH/DELETE).
const METHOD_OPTIONS: ExternalConnectionMethod[] = ['GET', 'POST'];

type Props = {
    label: string;
    value: ExternalConnectionMethod[];
    onChange: (value: ExternalConnectionMethod[]) => void;
    error?: ReactNode;
    disabled?: boolean;
};

/** Multi-select method chips (GET/POST). Shared by the onboarding wizard's
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
