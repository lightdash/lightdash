import { CHART_TYPE_ICONS, type ChartTypeIcon } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Popover,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    getChartTypeIcon,
    getChartTypeIconLabel,
} from '../utils/chartTypeIcons';
import classes from './ChartTypeIconPicker.module.css';

interface Props {
    value: ChartTypeIcon | null;
    onChange: (icon: ChartTypeIcon | null) => void;
    disabled: boolean;
}

const ChartTypeIconPicker: FC<Props> = ({ value, onChange, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filteredIcons = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return CHART_TYPE_ICONS;
        return CHART_TYPE_ICONS.filter(
            (iconName) =>
                iconName.toLowerCase().includes(term) ||
                getChartTypeIconLabel(iconName).toLowerCase().includes(term),
        );
    }, [search]);

    const handleSelect = (icon: ChartTypeIcon | null) => {
        onChange(icon);
        setIsOpen(false);
    };

    return (
        <Popover
            withArrow
            opened={isOpen}
            onChange={(opened) => {
                setIsOpen(opened);
                if (!opened) setSearch('');
            }}
        >
            <Popover.Target>
                <Tooltip label="Choose an icon" disabled={isOpen}>
                    <ActionIcon
                        variant="default"
                        size="lg"
                        display="flex"
                        aria-label="Chart type icon"
                        disabled={disabled}
                        onClick={() => setIsOpen((opened) => !opened)}
                    >
                        <MantineIcon icon={getChartTypeIcon(value)} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>

            <Popover.Dropdown p="xs" w={260}>
                <Stack gap="xs">
                    <TextInput
                        size="xs"
                        autoFocus
                        leftSection={<MantineIcon icon={IconSearch} />}
                        placeholder="Search icons"
                        value={search}
                        onChange={(event) =>
                            setSearch(event.currentTarget.value)
                        }
                    />

                    <ScrollArea.Autosize
                        className={classes.scroll}
                        type="scroll"
                    >
                        {filteredIcons.length === 0 ? (
                            <Text size="xs" c="dimmed" ta="center" py="xs">
                                No icons match
                            </Text>
                        ) : (
                            <Box className={classes.grid}>
                                {filteredIcons.map((iconName) => {
                                    const label =
                                        getChartTypeIconLabel(iconName);
                                    const isSelected = value === iconName;
                                    return (
                                        <Tooltip key={iconName} label={label}>
                                            <ActionIcon
                                                variant={
                                                    isSelected
                                                        ? 'light'
                                                        : 'subtle'
                                                }
                                                color={
                                                    isSelected
                                                        ? 'blue'
                                                        : undefined
                                                }
                                                aria-pressed={isSelected}
                                                aria-label={label}
                                                onClick={() =>
                                                    handleSelect(iconName)
                                                }
                                            >
                                                <MantineIcon
                                                    icon={getChartTypeIcon(
                                                        iconName,
                                                    )}
                                                />
                                            </ActionIcon>
                                        </Tooltip>
                                    );
                                })}
                            </Box>
                        )}
                    </ScrollArea.Autosize>

                    {value !== null && (
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            onClick={() => handleSelect(null)}
                        >
                            No icon
                        </Button>
                    )}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export default ChartTypeIconPicker;
