import {
    CustomFormatType,
    FeatureFlags,
    getErrorMessage,
    getItemId,
    isFormulaTableCalculation,
    isSqlTableCalculation,
    isTemplateTableCalculation,
    NumberSeparator,
    TableCalculationType,
    type CustomFormat,
    type TableCalculation,
    type TableCalculationTemplate,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    getDefaultZIndex,
    Group,
    Loader,
    Modal,
    Paper,
    SegmentedControl,
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
import MantineIcon from '../../../components/common/MantineIcon';
import { FormatForm } from '../../../components/Explorer/FormatForm';
import {
    selectCustomDimensions,
    selectMetricQuery,
    selectTableCalculations,
    selectTableName,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useToaster from '../../../hooks/toaster/useToaster';
import { useExplore } from '../../../hooks/useExplore';
import { useClientFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { getUniqueTableCalculationName } from '../utils';
import { FormulaForm } from './FormulaForm/FormulaForm';
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
    formula: string;
    format: CustomFormat;
    type?: TableCalculationType;
};

enum EditMode {
    SQL = 'sql',
    TEMPLATE = 'template',
    FORMULA = 'formula',
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

    // Default to Raw SQL, but show Template/Formula if it exists
    const hasTemplate = tableCalculation
        ? isTemplateTableCalculation(tableCalculation)
        : false;
    const hasFormula = tableCalculation
        ? isFormulaTableCalculation(tableCalculation)
        : false;
    const defaultMode = hasFormula
        ? EditMode.FORMULA
        : hasTemplate
          ? EditMode.TEMPLATE
          : EditMode.SQL;
    const [editMode, setEditMode] = useState<EditMode>(defaultMode);
    const submitButtonRef = useRef<HTMLButtonElement>(null);

    const { addToastError } = useToaster();

    const isFormulaEnabled = useClientFeatureFlag(
        FeatureFlags.FormulaTableCalculations,
    );

    // Explorer context for formula editor
    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const { data: explore } = useExplore(tableName);
    const tableCalculations = useExplorerSelector(selectTableCalculations);
    const customDimensions = useExplorerSelector(selectCustomDimensions);

    const initialValues = useMemo(
        () => ({
            name: tableCalculation?.displayName || '',
            sql:
                tableCalculation && isSqlTableCalculation(tableCalculation)
                    ? tableCalculation.sql
                    : '',
            formula:
                tableCalculation && isFormulaTableCalculation(tableCalculation)
                    ? tableCalculation.formula.replace(/^=/, '')
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

    // Memoize template for TemplateViewer
    const template = useMemo(
        () =>
            tableCalculation && isTemplateTableCalculation(tableCalculation)
                ? tableCalculation.template
                : undefined,
        [tableCalculation],
    );

    const [editedTemplate, setEditedTemplate] = useState<
        TableCalculationTemplate | undefined
    >(template);

    const form = useForm<TableCalculationFormInputs>({
        initialValues,
        validate: {
            name: validateName,
        },
    });

    const [formulaParseError, setFormulaParseError] = useState<string | null>(
        null,
    );

    const isFormulaInvalid =
        editMode === EditMode.FORMULA &&
        (!form.values.formula ||
            form.values.formula.trim().length === 0 ||
            formulaParseError !== null);

    const handleSubmit = form.onSubmit((data) => {
        const { name, sql, formula } = data;
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
                    template: editedTemplate ?? tableCalculation.template,
                });
            } else if (editMode === EditMode.FORMULA) {
                onSave({
                    name: finalName,
                    displayName: name,
                    format: data.format,
                    type: data.type,
                    formula: `=${formula}`,
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

    const handleTemplateChange = useCallback(
        (updated: TableCalculationTemplate) => {
            setEditedTemplate(updated);
        },
        [],
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

    // Memoize edit mode data for segmented control
    const editModeOptions = useMemo(
        () => [
            { value: EditMode.SQL, label: 'SQL' },
            {
                value: EditMode.FORMULA,
                label: isFormulaEnabled ? (
                    'Formula'
                ) : (
                    <Group spacing={6} noWrap sx={{ justifyContent: 'center' }}>
                        <Text span>Formula</Text>
                        <Badge
                            size="xs"
                            variant="filled"
                            color="indigo"
                            radius="sm"
                        >
                            Coming soon
                        </Badge>
                    </Group>
                ),
                disabled: !isFormulaEnabled,
            },
        ],
        [isFormulaEnabled],
    );

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

                            {!hasTemplate && (
                                <SegmentedControl
                                    value={editMode}
                                    onChange={(value) =>
                                        setEditMode(value as EditMode)
                                    }
                                    data={editModeOptions}
                                    size="xs"
                                />
                            )}

                            <Tabs
                                key={editMode}
                                defaultValue="editor"
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
                                            ? 'calc(85vh - 400px)'
                                            : 'auto',
                                    },
                                }}
                            >
                                <Tabs.List>
                                    <Tabs.Tab value="editor">
                                        {editMode === EditMode.TEMPLATE
                                            ? 'Template'
                                            : editMode === EditMode.FORMULA
                                              ? 'Formula'
                                              : 'SQL'}
                                    </Tabs.Tab>
                                    <Tabs.Tab value="format">Format</Tabs.Tab>
                                </Tabs.List>

                                <Tabs.Panel
                                    value="editor"
                                    style={{
                                        height: isExpanded
                                            ? 'calc(85vh - 400px)'
                                            : 'auto',
                                    }}
                                >
                                    {editMode === EditMode.TEMPLATE &&
                                    tableCalculation &&
                                    isTemplateTableCalculation(
                                        tableCalculation,
                                    ) ? (
                                        <Box p="sm">
                                            <TemplateViewer
                                                template={
                                                    editedTemplate ?? template
                                                }
                                                readOnly={false}
                                                onTemplateChange={
                                                    handleTemplateChange
                                                }
                                            />
                                        </Box>
                                    ) : editMode === EditMode.FORMULA ? (
                                        <Box p="sm">
                                            <FormulaForm
                                                explore={explore}
                                                metricQuery={metricQuery}
                                                formula={form.values.formula}
                                                initialFormula={
                                                    form.values.formula ||
                                                    undefined
                                                }
                                                onChange={(text) =>
                                                    form.setFieldValue(
                                                        'formula',
                                                        text,
                                                    )
                                                }
                                                onValidationChange={
                                                    setFormulaParseError
                                                }
                                                isFullScreen={isExpanded}
                                            />
                                        </Box>
                                    ) : (
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
                                    )}
                                </Tabs.Panel>

                                <Tabs.Panel value="format" p="sm">
                                    <FormatForm
                                        formatInputProps={getFormatInputProps}
                                        setFormatFieldValue={
                                            setFormatFieldValue
                                        }
                                        format={form.values.format}
                                    />
                                </Tabs.Panel>
                            </Tabs>

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
                                    disabled={
                                        (editMode === EditMode.SQL &&
                                            form.values.sql.length === 0) ||
                                        isFormulaInvalid
                                    }
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
