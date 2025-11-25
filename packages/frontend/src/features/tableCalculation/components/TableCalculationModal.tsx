import {
    CustomFormatType,
    getErrorMessage,
    getItemId,
    isSqlTableCalculation,
    isTemplateTableCalculation,
    NumberSeparator,
    TableCalculationType,
    type CustomFormat,
    type TableCalculation,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    getDefaultZIndex,
    Group,
    Loader,
    Modal,
    Paper,
    Select,
    Stack,
    Tabs,
    Text,
    TextInput,
    Tooltip,
    useMantineTheme,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconCalculator,
    IconMaximize,
    IconMinimize,
} from '@tabler/icons-react';
import {
    lazy,
    Suspense,
    useCallback,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { useToggle } from 'react-use';
import { type ValueOf } from 'type-fest';
import { FormatForm } from '../../../components/Explorer/FormatForm';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    selectCustomDimensions,
    selectTableCalculations,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useToaster from '../../../hooks/toaster/useToaster';
import { getUniqueTableCalculationName } from '../utils';
import { TemplateViewer } from './TemplateViewer/TemplateViewer';

// Lazy load SqlForm to avoid loading heavy Ace Editor on initial modal open
const SqlForm = lazy(() =>
    import('./SqlForm').then((module) => ({ default: module.SqlForm })),
);

type Props = ModalProps & {
    tableCalculation?: TableCalculation;
    onSave: (tableCalculation: TableCalculation) => void;
};

type TableCalculationFormInputs = {
    name: string;
    sql: string;
    format: CustomFormat;
    type?: TableCalculationType;
};

enum EditMode {
    SQL = 'sql',
    TEMPLATE = 'template',
}

const TableCalculationModal: FC<Props> = ({
    opened,
    tableCalculation,
    onSave,
    onClose,
}) => {
    const theme = useMantineTheme();
    const { colors } = theme;
    const [isExpanded, toggleExpanded] = useToggle(false);

    // Default to Raw SQL, but show Template if it exists
    const hasTemplate = tableCalculation
        ? isTemplateTableCalculation(tableCalculation)
        : false;
    const defaultMode = hasTemplate ? EditMode.TEMPLATE : EditMode.SQL;
    const [editMode, setEditMode] = useState<EditMode>(defaultMode);
    const submitButtonRef = useRef<HTMLButtonElement>(null);

    const { addToastError } = useToaster();

    const tableCalculations = useExplorerSelector(selectTableCalculations);
    const customDimensions = useExplorerSelector(selectCustomDimensions);

    const initialValues = useMemo(
        () => ({
            name: tableCalculation?.displayName || '',
            sql:
                tableCalculation && isSqlTableCalculation(tableCalculation)
                    ? tableCalculation.sql
                    : '',
            type: tableCalculation?.type || TableCalculationType.NUMBER,
            format: {
                type:
                    tableCalculation?.format?.type || CustomFormatType.DEFAULT,
                round: tableCalculation?.format?.round,
                separator:
                    tableCalculation?.format?.separator ||
                    NumberSeparator.DEFAULT,
                currency: tableCalculation?.format?.currency,
                compact: tableCalculation?.format?.compact,
                prefix: tableCalculation?.format?.prefix,
                suffix: tableCalculation?.format?.suffix,
                custom: tableCalculation?.format?.custom,
            },
        }),
        [tableCalculation],
    );

    const existingItemIds = useMemo(() => {
        const ids = new Set<string>();
        tableCalculations.forEach((tc) => {
            ids.add(getItemId(tc).toLowerCase().trim());
        });
        (customDimensions ?? []).forEach((cd) => {
            ids.add(getItemId(cd).toLowerCase().trim());
        });
        return ids;
    }, [tableCalculations, customDimensions]);

    const validateName = useCallback(
        (label: string) => {
            if (!label) return null;

            if (tableCalculation && tableCalculation.displayName === label) {
                return null;
            }

            const normalizedLabel = label.toLowerCase().trim();
            const isInvalid = existingItemIds.has(normalizedLabel);

            return isInvalid
                ? 'Table calculation/Dimension with this label already exists'
                : null;
        },
        [tableCalculation, existingItemIds],
    );

    const form = useForm<TableCalculationFormInputs>({
        initialValues,
        validate: {
            name: validateName,
        },
    });

    const handleSubmit = form.onSubmit((data) => {
        const { name, sql } = data;
        // throw error if sql is empty
        if (sql.length === 0 && editMode === EditMode.SQL) {
            addToastError({
                title: 'SQL cannot be empty',
                key: 'table-calculation-modal',
            });
            return;
        }
        // throw error if name is empty
        if (name.length === 0) {
            addToastError({
                title: 'Name cannot be empty',
                key: 'table-calculation-modal',
            });
            return;
        }
        try {
            // Determine the final name - only run uniqueness check if name changed or it's a new calculation
            const isNewCalculation = !tableCalculation;
            const nameChanged =
                tableCalculation && tableCalculation.displayName !== name;

            let finalName: string;
            if (isNewCalculation || nameChanged) {
                finalName = getUniqueTableCalculationName(
                    name,
                    tableCalculations,
                    tableCalculation,
                );
            } else {
                // Name unchanged - keep the original name
                finalName = tableCalculation.name;
            }

            if (
                editMode === EditMode.TEMPLATE &&
                tableCalculation &&
                isTemplateTableCalculation(tableCalculation)
            ) {
                onSave({
                    name: finalName,
                    displayName: name,
                    format: data.format,
                    type: data.type,
                    template: tableCalculation.template,
                });
            } else {
                onSave({
                    name: finalName,
                    displayName: name,
                    format: data.format,
                    type: data.type,
                    sql,
                });
            }
        } catch (e) {
            addToastError({
                title: 'Error saving',
                subtitle: getErrorMessage(e),
                key: 'table-calculation-modal',
            });
        }
    });

    const getFormatInputProps = useCallback(
        (path: keyof CustomFormat) => {
            return form.getInputProps(`format.${path}`);
        },
        [form],
    );

    const setFormatFieldValue = useCallback(
        (path: keyof CustomFormat, value: ValueOf<CustomFormat>) => {
            return form.setFieldValue(`format.${path}`, value);
        },
        [form],
    );

    // Memoize callback for Cmd+Enter
    const handleCmdEnter = useCallback(() => {
        if (submitButtonRef.current) {
            submitButtonRef.current.click();
        }
    }, []);

    // Memoize template for TemplateViewer
    const template = useMemo(
        () =>
            tableCalculation && isTemplateTableCalculation(tableCalculation)
                ? tableCalculation.template
                : undefined,
        [tableCalculation],
    );

    // Memoize table calculation type options
    const tableCalculationTypeOptions = useMemo(
        () => Object.values(TableCalculationType),
        [],
    );

    // Memoize type change handler
    const handleTypeChange = useCallback(
        (value: string | null) => {
            if (
                value &&
                tableCalculationTypeOptions.includes(
                    value as TableCalculationType,
                )
            ) {
                form.setFieldValue('type', value as TableCalculationType);
            }
        },
        [form, tableCalculationTypeOptions],
    );

    // Memoize edit mode data
    const editModeOptions = useMemo(
        () => [
            {
                value: EditMode.SQL,
                label: 'Raw SQL',
            },
            {
                value: EditMode.TEMPLATE,
                label: 'Predefined Template',
            },
        ],
        [],
    );

    // Memoize edit mode change handler
    const handleEditModeChange = useCallback((value: string | null) => {
        if (value) {
            setEditMode(value as EditMode);
        }
    }, []);

    return (
        <Modal.Root
            opened={opened}
            onClose={onClose}
            size="xl"
            centered
            styles={{
                content: {
                    minWidth: isExpanded ? '90vw' : 'auto',
                    height: isExpanded ? '80vh' : 'auto',
                },
            }}
        >
            <Modal.Overlay />
            <Modal.Content
                sx={{
                    margin: '0 auto',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: isExpanded ? '90vh' : '60vh',
                }}
            >
                <Modal.Header
                    sx={(themeProps) => ({
                        borderBottom: `1px solid ${themeProps.colors.ldGray[2]}`,
                        padding: themeProps.spacing.sm,
                    })}
                >
                    <Group spacing="xs">
                        <Paper p="xs" withBorder radius="sm">
                            <MantineIcon icon={IconCalculator} size="sm" />
                        </Paper>
                        <Text fw={700} fz="md">
                            {tableCalculation ? 'Edit' : 'Create'} Table
                            Calculation
                            {tableCalculation ? (
                                <Text span fw={400}>
                                    {' '}
                                    - {tableCalculation.displayName}
                                </Text>
                            ) : null}
                        </Text>
                    </Group>
                    <Modal.CloseButton />
                </Modal.Header>

                <form
                    name="table_calculation"
                    onSubmit={handleSubmit}
                    style={{ display: 'contents' }}
                >
                    <Modal.Body
                        p={0}
                        sx={{
                            flex: 1,
                        }}
                    >
                        <Stack p="sm" spacing="xs">
                            <TextInput
                                label="Name"
                                required
                                placeholder="E.g. Cumulative order count"
                                data-testid="table-calculation-name-input"
                                {...form.getInputProps('name')}
                            />

                            {hasTemplate && (
                                <Select
                                    label="Calculation Mode"
                                    value={editMode}
                                    onChange={handleEditModeChange}
                                    data={editModeOptions}
                                    mb="md"
                                />
                            )}

                            {editMode === EditMode.TEMPLATE ? (
                                <Tabs
                                    key="template"
                                    defaultValue="template"
                                    color="indigo"
                                    variant="outline"
                                    radius="xs"
                                    styles={{
                                        panel: {
                                            borderColor: colors.gray[2],
                                            borderWidth: 1,
                                            borderStyle: 'solid',
                                            borderTop: 'none',
                                            height: isExpanded
                                                ? 'calc(90vh - 400px)'
                                                : 'auto',
                                        },
                                    }}
                                >
                                    <Tabs.List>
                                        <Tabs.Tab value="template">
                                            Template
                                        </Tabs.Tab>

                                        <Tabs.Tab value="format">
                                            Format
                                        </Tabs.Tab>
                                    </Tabs.List>

                                    <Tabs.Panel value="template" p="sm">
                                        <TemplateViewer
                                            template={template}
                                            readOnly={true}
                                        />
                                    </Tabs.Panel>

                                    <Tabs.Panel value="format" p="sm">
                                        <FormatForm
                                            formatInputProps={
                                                getFormatInputProps
                                            }
                                            setFormatFieldValue={
                                                setFormatFieldValue
                                            }
                                            format={form.values.format}
                                        />
                                    </Tabs.Panel>
                                </Tabs>
                            ) : (
                                <Tabs
                                    key="sql"
                                    defaultValue={'sqlEditor'}
                                    color="indigo"
                                    variant="outline"
                                    radius="xs"
                                    styles={{
                                        panel: {
                                            borderColor: colors.ldGray[2],
                                            borderWidth: 1,
                                            borderStyle: 'solid',
                                            borderTop: 'none',
                                            height: isExpanded
                                                ? 'calc(90vh - 400px)'
                                                : 'auto',
                                        },
                                    }}
                                >
                                    <Tabs.List>
                                        <Tabs.Tab value="sqlEditor">
                                            SQL
                                        </Tabs.Tab>
                                        <Tabs.Tab value="format">
                                            Format
                                        </Tabs.Tab>
                                    </Tabs.List>

                                    <Tabs.Panel value="sqlEditor">
                                        <Suspense
                                            fallback={
                                                <Box
                                                    p="xl"
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent:
                                                            'center',
                                                        minHeight: '250px',
                                                        gap: '12px',
                                                    }}
                                                >
                                                    <Loader size="sm" />
                                                    <Text c="dimmed" size="sm">
                                                        Loading SQL editor...
                                                    </Text>
                                                </Box>
                                            }
                                        >
                                            <SqlForm
                                                form={form}
                                                isFullScreen={isExpanded}
                                                focusOnRender={true}
                                                onCmdEnter={handleCmdEnter}
                                            />
                                        </Suspense>
                                    </Tabs.Panel>

                                    <Tabs.Panel value="format" p="sm">
                                        <FormatForm
                                            formatInputProps={
                                                getFormatInputProps
                                            }
                                            setFormatFieldValue={
                                                setFormatFieldValue
                                            }
                                            format={form.values.format}
                                        />
                                    </Tabs.Panel>
                                </Tabs>
                            )}

                            <Tooltip
                                position="right"
                                withArrow
                                multiline
                                maw={400}
                                variant="xs"
                                withinPortal
                                label={
                                    'Manually select the type of the result of this SQL table calculation, this will help us to treat this field correctly in filters or results.'
                                }
                            >
                                <Select
                                    label={'Result type'}
                                    id="download-type"
                                    sx={{
                                        alignSelf: 'flex-start',
                                    }}
                                    {...form.getInputProps('type')}
                                    onChange={handleTypeChange}
                                    data={tableCalculationTypeOptions}
                                />
                            </Tooltip>
                        </Stack>
                    </Modal.Body>

                    <Box
                        sx={(themeProps) => ({
                            borderTop: `1px solid ${themeProps.colors.ldGray[2]}`,
                            padding: themeProps.spacing.sm,
                            backgroundColor: themeProps.colors.background,
                            position: 'sticky',
                            bottom: 0,
                            width: '100%',
                            zIndex: getDefaultZIndex('modal'),
                        })}
                    >
                        <Group position="apart">
                            <Tooltip label="Expand/Collapse" variant="xs">
                                <ActionIcon
                                    variant="outline"
                                    onClick={toggleExpanded}
                                >
                                    <MantineIcon
                                        icon={
                                            isExpanded
                                                ? IconMinimize
                                                : IconMaximize
                                        }
                                    />
                                </ActionIcon>
                            </Tooltip>

                            <Group spacing="xs">
                                <Button
                                    variant="default"
                                    h={32}
                                    onClick={onClose}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    h={32}
                                    type="submit"
                                    ref={submitButtonRef}
                                    data-testid="table-calculation-save-button"
                                >
                                    {tableCalculation
                                        ? 'Save changes'
                                        : 'Create'}
                                </Button>
                            </Group>
                        </Group>
                    </Box>
                </form>
            </Modal.Content>
        </Modal.Root>
    );
};

export default TableCalculationModal;
