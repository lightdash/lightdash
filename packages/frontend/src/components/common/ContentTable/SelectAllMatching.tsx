import { Button, Group, Text } from '@mantine/core';
import { type FC } from 'react';

type Props = {
    selectedCount: number;
    matchingCount: number;
    allMatching: boolean;
    onSelectAll: () => void;
    onClear: () => void;
};

export const SelectAllMatching: FC<Props> = ({
    selectedCount,
    matchingCount,
    allMatching,
    onSelectAll,
    onClear,
}) => (
    <Group gap="xs" wrap="wrap">
        <Text fz="sm" fw={500}>
            {allMatching ? matchingCount : selectedCount} selected
        </Text>
        {!allMatching && matchingCount > selectedCount && (
            <Button size="xs" variant="subtle" onClick={onSelectAll}>
                Select all {matchingCount} matching
            </Button>
        )}
        <Button size="xs" variant="subtle" onClick={onClear}>
            Clear
        </Button>
    </Group>
);
