import {
    Box,
    Button,
    Center,
    Checkbox,
    FileButton,
    getDefaultZIndex,
    Group,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import {
    IconClearAll,
    IconFileUpload,
    IconSettings,
} from '@tabler/icons-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import uniq from 'lodash/uniq';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import MantineIcon from '../../MantineIcon';
import MantineModal from '../../MantineModal';
import classes from './ManageFilterValuesModal.module.css';
import { parseDelimitedValues } from './ManageFilterValuesModal.utils';

type Props = {
    opened: boolean;
    onClose: () => void;
    values: string[];
    onChange: (values: string[]) => void;
    title?: string;
};

export const ManageFilterValuesModal: FC<Props> = ({
    opened,
    onClose,
    values,
    onChange,
    title = 'Manage values',
}) => {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const originalValuesRef = useRef<string[]>([]);

    const valuesNormalized = useMemo(() => uniq(values), [values]);
    const [draftValues, setDraftValues] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const workingValues = useMemo(() => uniq(draftValues), [draftValues]);
    const filteredValues = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (q.length === 0) return workingValues;
        return workingValues.filter((v) => v.toLowerCase().includes(q));
    }, [search, workingValues]);
    const shownCount = filteredValues.length;
    const selectedCount = selected.size;
    const isAllShownSelected = shownCount > 0 && selectedCount === shownCount;
    const isSomeShownSelected = selectedCount > 0 && selectedCount < shownCount;

    const virtualizer = useVirtualizer({
        count: filteredValues.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => 36,
        overscan: 8,
    });

    // Initialize a draft snapshot when opening the modal.
    useEffect(() => {
        if (!opened) return;
        originalValuesRef.current = valuesNormalized;
        setDraftValues(valuesNormalized);
        setSearch('');
        setSelected(new Set(valuesNormalized));
    }, [opened, valuesNormalized]);

    // Ensure the virtualizer measures after open/layout changes.
    useEffect(() => {
        if (!opened) return;
        const raf = requestAnimationFrame(() => {
            virtualizer.measure();
        });
        return () => cancelAnimationFrame(raf);
    }, [opened, virtualizer, filteredValues.length]);

    const handleClearAll = useCallback(() => {
        setDraftValues([]);
        setSelected(new Set());
    }, []);

    const handleCancel = useCallback(() => {
        setDraftValues([]);
        setSearch('');
        setSelected(new Set());
        onClose();
    }, [onClose]);

    const handleApply = useCallback(() => {
        const selectedValues = workingValues.filter((value) =>
            selected.has(value),
        );
        onChange(selectedValues);
        onClose();
    }, [onChange, onClose, selected, workingValues]);

    const handleCsvFileChange = useCallback(async (file: File | null) => {
        if (!file) return;

        const text = await file.text();
        const parsedUnique = uniq(parseDelimitedValues(text));
        if (parsedUnique.length === 0) return;

        // Append to the current draft by default
        setDraftValues((prev) => uniq([...prev, ...parsedUnique]));
    }, []);

    const toggleSelected = useCallback((value: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(value)) next.delete(value);
            else next.add(value);
            return next;
        });
    }, []);

    const selectAllVisible = useCallback(() => {
        setSelected((prev) => {
            const next = new Set(prev);
            filteredValues.forEach((v) => next.add(v));
            return next;
        });
    }, [filteredValues]);

    const clearSelection = useCallback(() => {
        setSelected(new Set());
    }, []);

    const isClearAllDisabled = workingValues.length === 0;

    return (
        <MantineModal
            opened={opened}
            onClose={handleCancel}
            onCancel={handleCancel}
            title={title}
            icon={IconSettings}
            size="lg"
            cancelLabel="Cancel"
            confirmLabel="Apply"
            onConfirm={handleApply}
            modalRootProps={{ zIndex: getDefaultZIndex('modal') + 1000 }}
            leftActions={
                <Tooltip label="Clear all values">
                    <Button
                        variant="default"
                        leftSection={<MantineIcon icon={IconClearAll} />}
                        onClick={handleClearAll}
                        disabled={isClearAllDisabled}
                    >
                        Clear all
                    </Button>
                </Tooltip>
            }
        >
            <Stack gap="sm">
                <Group gap="xs" justify="space-between" align="center">
                    <Text fw={500}>
                        {workingValues.length.toLocaleString()} values
                        <Text span c="dimmed" size="xs" ta="center" maw={300}>
                            {' '}
                            ({selected.size.toLocaleString()} selected)
                        </Text>
                    </Text>

                    <FileButton
                        onChange={handleCsvFileChange}
                        accept=".csv,.txt,text/csv,text/plain"
                        inputProps={{ 'aria-label': 'Import CSV file' }}
                    >
                        {(props) => (
                            <Button
                                {...props}
                                size="xs"
                                variant="light"
                                leftSection={
                                    <MantineIcon icon={IconFileUpload} />
                                }
                            >
                                Import CSV
                            </Button>
                        )}
                    </FileButton>
                </Group>

                <Box className={classes.container}>
                    <Group className={classes.header} wrap="nowrap">
                        <Group className={classes.headerRow} wrap="nowrap">
                            <Checkbox
                                size="xs"
                                aria-label="Select all shown"
                                checked={isAllShownSelected}
                                indeterminate={isSomeShownSelected}
                                onChange={() => {
                                    if (isAllShownSelected) {
                                        clearSelection();
                                    } else {
                                        selectAllVisible();
                                    }
                                }}
                            />
                            <Text fw={500}>Selections</Text>
                        </Group>
                        <Box className={classes.headerSearch}>
                            <TextInput
                                size="xs"
                                placeholder="Search values…"
                                value={search}
                                onChange={(e) =>
                                    setSearch(e.currentTarget.value)
                                }
                            />
                        </Box>
                    </Group>

                    <Box ref={scrollRef} className={classes.scrollContainer}>
                        {filteredValues.length === 0 ? (
                            <Center className={classes.emptyState}>
                                <Stack gap="xs" align="center">
                                    <Text fw={500}>
                                        {workingValues.length === 0
                                            ? 'No values yet'
                                            : 'No matches'}
                                    </Text>
                                    <Text
                                        c="dimmed"
                                        size="xs"
                                        ta="center"
                                        maw={300}
                                    >
                                        {workingValues.length === 0
                                            ? 'Import a CSV to populate this filter, then you can review and remove items here.'
                                            : 'Try a different search.'}
                                    </Text>
                                    <FileButton
                                        onChange={handleCsvFileChange}
                                        accept=".csv,.txt,text/csv,text/plain"
                                        inputProps={{
                                            'aria-label': 'Import CSV file',
                                        }}
                                    >
                                        {(props) => (
                                            <Button
                                                {...props}
                                                size="xs"
                                                variant="default"
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconFileUpload}
                                                    />
                                                }
                                            >
                                                Import CSV
                                            </Button>
                                        )}
                                    </FileButton>
                                </Stack>
                            </Center>
                        ) : (
                            <Box
                                className={classes.virtualInner}
                                h={virtualizer.getTotalSize()}
                            >
                                {virtualizer
                                    .getVirtualItems()
                                    .map((virtualRow) => {
                                        const value =
                                            filteredValues[virtualRow.index];
                                        if (value === undefined) return null;
                                        const checked = selected.has(value);
                                        return (
                                            <Box
                                                key={value}
                                                className={classes.row}
                                                style={{
                                                    transform: `translateY(${virtualRow.start}px)`,
                                                    height: `${virtualRow.size}px`,
                                                }}
                                            >
                                                <Group
                                                    h={36}
                                                    gap="xs"
                                                    px="sm"
                                                    wrap="nowrap"
                                                >
                                                    <Checkbox
                                                        checked={checked}
                                                        aria-label={`Select ${value}`}
                                                        onChange={() =>
                                                            toggleSelected(
                                                                value,
                                                            )
                                                        }
                                                    />
                                                    <Text
                                                        size="sm"
                                                        lineClamp={1}
                                                    >
                                                        {value}
                                                    </Text>
                                                </Group>
                                            </Box>
                                        );
                                    })}
                            </Box>
                        )}
                    </Box>
                </Box>
            </Stack>
        </MantineModal>
    );
};
