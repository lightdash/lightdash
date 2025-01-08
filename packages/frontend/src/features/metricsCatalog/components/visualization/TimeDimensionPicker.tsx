import {
    type ApiGetMetricPeek,
    type TimeDimensionConfig,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Input, Popover, Text } from '@mantine/core';
import { IconChevronDown, IconTable } from '@tabler/icons-react';
import {
    forwardRef,
    useState,
    type ComponentPropsWithoutRef,
    type FC,
} from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';

type Props = {
    fields: NonNullable<ApiGetMetricPeek['results']['availableTimeDimensions']>;
    dimension: TimeDimensionConfig;
    onChange: (config: TimeDimensionConfig) => void;
};

const FieldItem = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'> & {
        value: string;
        label: string;
        tableLabel: string;
        selected: boolean;
    }
>(({ value, label, tableLabel, ...others }, ref) => (
    <Box ref={ref} {...others}>
        <Group noWrap position="apart">
            <Text fz="sm" c="dark.8" fw={500}>
                {label}
            </Text>
            <Group spacing={4} noWrap>
                <MantineIcon color="gray.6" size={12} icon={IconTable} />
                <Text fz="xs" c="gray.6" span>
                    {tableLabel}
                </Text>
            </Group>
        </Group>
    </Box>
));

export const TimeDimensionPicker: FC<Props> = ({
    fields,
    dimension,
    onChange,
}) => {
    const [search, setSearch] = useState('');
    const [opened, setOpened] = useState(false);
    const [value, setValue] = useState<string | null>(dimension?.field || null);

    const filteredFields = fields.filter((field) =>
        field.label.toLowerCase().includes(search.toLowerCase().trim()),
    );

    const handleSelection = (selectedValue: string) => {
        setValue(selectedValue);
        const selectedField = fields.find((f) => f.name === selectedValue);
        if (selectedField) {
            onChange({
                field: selectedField.name,
                interval: dimension.interval,
                table: selectedField.table,
            });
        }
        setOpened(false);
    };

    return (
        <Popover
            opened={opened}
            onClose={() => setOpened(false)}
            position="bottom-start"
            width="270px"
        >
            <Popover.Target>
                <Box
                    onClick={() => setOpened((o) => !o)}
                    sx={{
                        width: '270px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        padding: '8px 12px',
                        border: '1px solid #ced4da',
                        borderRadius: 8,
                        backgroundColor: '#fff',
                    }}
                >
                    <Text c={value ? 'dark.8' : 'gray.6'}>
                        {value
                            ? fields.find((f) => f.name === value)?.label
                            : 'Select a time dimension'}
                    </Text>
                    <ActionIcon>
                        <MantineIcon icon={IconChevronDown} />
                    </ActionIcon>
                </Box>
            </Popover.Target>

            <Popover.Dropdown>
                <Box
                    sx={{
                        maxHeight: '200px',
                        overflowY: 'auto',
                    }}
                >
                    {filteredFields.map((field) => (
                        <Box
                            key={field.name}
                            onClick={() => handleSelection(field.name)}
                            sx={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #f0f0f0',
                            }}
                            onMouseEnter={(e: any) =>
                                (e.currentTarget.style.backgroundColor =
                                    '#f8f9fa')
                            }
                            onMouseLeave={(e: any) =>
                                (e.currentTarget.style.backgroundColor = '#fff')
                            }
                        >
                            <FieldItem
                                value={field.name}
                                label={field.label}
                                tableLabel={field.tableLabel}
                                selected={field.name === value}
                            />
                        </Box>
                    ))}
                    {filteredFields.length === 0 && (
                        <Text c="gray.6" fz="sm" align="center" mt="sm">
                            Nothing found
                        </Text>
                    )}
                </Box>
                {fields.length > 5 && (
                    <Input
                        value={search}
                        onChange={(event: any) =>
                            setSearch(event.currentTarget.value)
                        }
                        placeholder="Search time dimensions"
                        radius="md"
                        mb="sm"
                    />
                )}
            </Popover.Dropdown>
        </Popover>
    );
};
