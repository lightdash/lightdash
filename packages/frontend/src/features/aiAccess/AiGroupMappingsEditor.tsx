import { type UpsertAiAccessPolicy } from '@lightdash/common';
import {
    Button,
    Group,
    ActionIcon,
    Tooltip,
    Select,
    Stack,
    TextInput,
} from '@mantine/core';
import { randomId } from '@mantine/hooks';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { NumberInput } from '../../components/common/NumberInput';
type Mappings = UpsertAiAccessPolicy['groupMappings'];
export const AiGroupMappingsEditor = ({
    value,
    groups,
    onChange,
}: {
    value: Mappings;
    groups: { value: string; label: string }[];
    onChange: (rows: Mappings) => void;
}) => {
    const [rowIds, setRowIds] = useState(() => value.map(() => randomId()));
    const ids =
        rowIds.length === value.length
            ? rowIds
            : value.map((_, index) => rowIds[index] ?? randomId());
    const update = (index: number, patch: Partial<Mappings[number]>) =>
        onChange(
            value.map((row, i) => (i === index ? { ...row, ...patch } : row)),
        );
    return (
        <Stack gap="sm">
            {value.map((row, index) => (
                <Group key={ids[index]} align="flex-start">
                    <Select
                        label="Group"
                        data={groups}
                        searchable
                        value={row.groupUuid || null}
                        onChange={(groupUuid) =>
                            update(index, { groupUuid: groupUuid ?? '' })
                        }
                        error={
                            row.groupUuid &&
                            value.some(
                                (other, i) =>
                                    i !== index &&
                                    other.groupUuid === row.groupUuid,
                            )
                                ? 'Each group can only be mapped once'
                                : undefined
                        }
                    />
                    <TextInput
                        label="Principal reference"
                        value={row.ref}
                        onChange={(event) =>
                            update(index, { ref: event.currentTarget.value })
                        }
                        error={
                            row.ref.trim() &&
                            value.some(
                                (other, i) =>
                                    i !== index &&
                                    other.ref.trim() === row.ref.trim(),
                            )
                                ? 'Principal references must be unique'
                                : undefined
                        }
                    />
                    <NumberInput
                        label="Priority"
                        description="Higher wins when a person is in several groups"
                        value={row.priority}
                        allowDecimal={false}
                        onNumberChange={(priority) =>
                            update(index, { priority: priority ?? 0 })
                        }
                    />
                    <Tooltip label="Remove mapping">
                        <ActionIcon
                            aria-label="Remove mapping"
                            variant="subtle"
                            mt="lg"
                            onClick={() => {
                                setRowIds(ids.filter((_, i) => i !== index));
                                onChange(value.filter((_, i) => i !== index));
                            }}
                        >
                            <MantineIcon icon={IconTrash} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            ))}
            <Button
                variant="light"
                w="fit-content"
                leftSection={<MantineIcon icon={IconPlus} />}
                onClick={() => {
                    setRowIds([...ids, randomId()]);
                    onChange([
                        ...value,
                        { groupUuid: '', ref: '', priority: 0 },
                    ]);
                }}
            >
                Add mapping
            </Button>
        </Stack>
    );
};
