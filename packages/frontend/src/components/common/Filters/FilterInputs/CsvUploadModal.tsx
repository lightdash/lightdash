import {
    Alert,
    Box,
    Button,
    FileInput,
    Flex,
    Modal,
    ScrollArea,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import {
    detectContentType,
    extractColumn,
    parseCsvContent,
    parseSimpleList,
    type ParsedCsv,
} from '../../../../utils/csvParser';
import MantineIcon from '../../MantineIcon';

type Props = {
    opened: boolean;
    onClose: () => void;
    onAddValues: (values: string[]) => void;
};

const MAX_PREVIEW_VALUES = 10;
const MAX_RECOMMENDED_VALUES = 1000;

const CsvUploadModal: FC<Props> = ({ opened, onClose, onAddValues }) => {
    const [file, setFile] = useState<File | null>(null);
    const [parsedCsv, setParsedCsv] = useState<ParsedCsv | null>(null);
    const [simpleListValues, setSimpleListValues] = useState<string[] | null>(
        null,
    );
    const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Track current file to prevent race conditions when user selects a new file
    // before the previous file finishes reading
    const currentFileRef = useRef<File | null>(null);

    const handleFileChange = useCallback((newFile: File | null) => {
        currentFileRef.current = newFile;
        setFile(newFile);
        setError(null);
        setParsedCsv(null);
        setSimpleListValues(null);
        setSelectedColumn(null);

        if (!newFile) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            // Ignore stale callback if user has selected a different file
            if (currentFileRef.current !== newFile) {
                return;
            }

            const content = event.target?.result;
            if (typeof content !== 'string') {
                setError('Could not read file content');
                return;
            }

            try {
                const contentType = detectContentType(content);

                if (contentType === 'simple-list') {
                    const values = parseSimpleList(content);
                    if (values.length === 0) {
                        setError('No values found in file');
                        return;
                    }
                    setSimpleListValues(values);
                    setParsedCsv(null);
                } else {
                    const parsed = parseCsvContent(content);
                    if (parsed.rows.length === 0) {
                        setError('No data rows found in file');
                        return;
                    }
                    setParsedCsv(parsed);
                    setSimpleListValues(null);
                    // Auto-select first column
                    setSelectedColumn('0');
                }
            } catch (e) {
                setError('Failed to parse file. Please check the format.');
            }
        };

        reader.onerror = () => {
            // Ignore stale error if user has selected a different file
            if (currentFileRef.current !== newFile) {
                return;
            }
            setError('Failed to read file');
        };

        reader.readAsText(newFile);
    }, []);

    const previewValues = useMemo(() => {
        if (simpleListValues) {
            return simpleListValues;
        }

        if (parsedCsv && selectedColumn !== null) {
            const columnIndex = parseInt(selectedColumn, 10);
            return extractColumn(parsedCsv, columnIndex);
        }

        return [];
    }, [simpleListValues, parsedCsv, selectedColumn]);

    const columnOptions = useMemo(() => {
        if (!parsedCsv) return [];

        return parsedCsv.headers.map((header, index) => ({
            value: String(index),
            label: header,
        }));
    }, [parsedCsv]);

    const isMultiColumn = parsedCsv && parsedCsv.headers.length > 1;

    const handleClose = useCallback(() => {
        currentFileRef.current = null;
        setFile(null);
        setParsedCsv(null);
        setSimpleListValues(null);
        setSelectedColumn(null);
        setError(null);
        onClose();
    }, [onClose]);

    const handleAddValues = useCallback(() => {
        if (previewValues.length === 0) return;

        onAddValues(previewValues);
        handleClose();
    }, [previewValues, onAddValues, handleClose]);

    const showLargeFileWarning = previewValues.length > MAX_RECOMMENDED_VALUES;

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            title="Upload filter values from file"
            size="md"
        >
            <Stack spacing="md">
                <FileInput
                    label="Select file"
                    description="Upload a CSV or text file with one value per line"
                    // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
                    // @ts-ignore
                    placeholder="Choose file..."
                    accept=".csv,.txt,text/csv,text/plain"
                    value={file}
                    onChange={handleFileChange}
                />

                {error && (
                    <Alert
                        icon={<MantineIcon icon={IconAlertCircle} />}
                        color="red"
                        variant="light"
                    >
                        {error}
                    </Alert>
                )}

                {isMultiColumn && (
                    <Select
                        label="Select column"
                        description="Choose which column contains the filter values"
                        data={columnOptions}
                        value={selectedColumn}
                        onChange={setSelectedColumn}
                    />
                )}

                {previewValues.length > 0 && (
                    <Stack spacing="xs">
                        <Text size="sm" fw={500}>
                            Preview ({previewValues.length} values)
                        </Text>

                        {showLargeFileWarning && (
                            <Alert
                                icon={<MantineIcon icon={IconAlertCircle} />}
                                color="yellow"
                                variant="light"
                                py="xs"
                            >
                                <Text size="xs">
                                    Large number of values may affect
                                    performance
                                </Text>
                            </Alert>
                        )}

                        <ScrollArea type="hover" scrollbarSize={6}>
                            <Box mah={200}>
                                <Stack spacing={4}>
                                    {previewValues
                                        .slice(0, MAX_PREVIEW_VALUES)
                                        .map((value, index) => (
                                            <Text
                                                key={index}
                                                size="xs"
                                                color="dimmed"
                                                sx={(theme) => ({
                                                    padding: '4px 8px',
                                                    backgroundColor:
                                                        theme.colors.gray[0],
                                                    borderRadius:
                                                        theme.radius.xs,
                                                    fontFamily: 'monospace',
                                                })}
                                            >
                                                {value}
                                            </Text>
                                        ))}
                                    {previewValues.length >
                                        MAX_PREVIEW_VALUES && (
                                        <Text
                                            size="xs"
                                            color="dimmed"
                                            fs="italic"
                                        >
                                            ...and{' '}
                                            {previewValues.length -
                                                MAX_PREVIEW_VALUES}{' '}
                                            more
                                        </Text>
                                    )}
                                </Stack>
                            </Box>
                        </ScrollArea>
                    </Stack>
                )}

                <Flex justify="flex-end" gap="sm" mt="md">
                    <Button variant="subtle" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleAddValues}
                        disabled={previewValues.length === 0}
                    >
                        Add {previewValues.length} value
                        {previewValues.length !== 1 ? 's' : ''}
                    </Button>
                </Flex>
            </Stack>
        </Modal>
    );
};

export default CsvUploadModal;
