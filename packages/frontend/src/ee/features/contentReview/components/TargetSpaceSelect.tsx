import { type SpaceSummary } from '@lightdash/common';
import { Group, Select, Stack, Text } from '@mantine/core';
import { IconFolder } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';

export type TargetSpaceOption = Pick<
    SpaceSummary,
    'uuid' | 'name' | 'parentSpaceUuid'
>;

type Props = {
    spaces: TargetSpaceOption[];
    value: string | null;
    onChange: (spaceUuid: string | null) => void;
    disabled?: boolean;
};

type OptionMeta = { name: string; parentPath: string };

// Flat, searchable picker. Nested spaces show their parent path so two
// spaces with the same name stay distinguishable without a tree.
const TargetSpaceSelect: FC<Props> = ({
    spaces,
    value,
    onChange,
    disabled = false,
}) => {
    const { data, meta } = useMemo(() => {
        const byUuid = new Map(spaces.map((space) => [space.uuid, space]));
        const pathOf = (space: TargetSpaceOption): string[] => {
            const names: string[] = [];
            let current: TargetSpaceOption | undefined = space;
            const seen = new Set<string>();
            while (current && !seen.has(current.uuid)) {
                seen.add(current.uuid);
                names.unshift(current.name);
                current = current.parentSpaceUuid
                    ? byUuid.get(current.parentSpaceUuid)
                    : undefined;
            }
            return names;
        };
        const options = spaces
            .map((space) => {
                const path = pathOf(space);
                return {
                    value: space.uuid,
                    label: path.join(' / '),
                    name: space.name,
                    parentPath: path.slice(0, -1).join(' / '),
                };
            })
            .sort((a, b) => a.label.localeCompare(b.label));
        return {
            data: options.map(({ value: v, label }) => ({ value: v, label })),
            meta: new Map<string, OptionMeta>(
                options.map((option) => [
                    option.value,
                    { name: option.name, parentPath: option.parentPath },
                ]),
            ),
        };
    }, [spaces]);

    return (
        <Select
            label="Shared space"
            placeholder="Pick a space"
            data={data}
            value={value}
            onChange={onChange}
            searchable
            clearable={false}
            allowDeselect={false}
            nothingFoundMessage="No space matches"
            disabled={disabled}
            leftSection={<MantineIcon icon={IconFolder} color="dimmed" />}
            maxDropdownHeight={260}
            comboboxProps={{ withinPortal: true }}
            renderOption={({ option }) => {
                const item = meta.get(option.value);
                return (
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon icon={IconFolder} color="dimmed" />
                        <Stack gap={0}>
                            <Text fz="sm">{item?.name ?? option.label}</Text>
                            {item?.parentPath && (
                                <Text fz="xs" c="dimmed">
                                    {item.parentPath}
                                </Text>
                            )}
                        </Stack>
                    </Group>
                );
            }}
        />
    );
};

export default TargetSpaceSelect;
