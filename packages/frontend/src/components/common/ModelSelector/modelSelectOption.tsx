import type { AiModelOption } from '@lightdash/common';
import { Group, Text, type ComboboxItem } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import MantineIcon from '../MantineIcon';
import { RetiredModelBadge } from './RetiredModelBadge';
import { getModelKey } from './utils';

export type ModelSelectItem = ComboboxItem & { deprecated: boolean };

export const toModelSelectItem = (model: AiModelOption): ModelSelectItem => ({
    value: getModelKey(model),
    label: model.displayName,
    deprecated: model.deprecated,
});

// renderOption replaces Mantine's whole option node, including the built-in
// selection check — render it manually from `checked`.
export const renderModelSelectOption = ({
    option,
    checked,
}: {
    option: ComboboxItem;
    checked?: boolean;
}) => (
    <Group flex={1} justify="space-between" wrap="nowrap" gap="xs">
        <Group gap={6} wrap="nowrap">
            <Text size="sm">{option.label}</Text>
            {'deprecated' in option && option.deprecated === true && (
                <RetiredModelBadge />
            )}
        </Group>
        {checked && <MantineIcon icon={IconCheck} size="sm" />}
    </Group>
);
