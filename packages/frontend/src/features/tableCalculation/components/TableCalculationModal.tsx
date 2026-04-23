import {
    CustomFormatType,
    getErrorMessage,
    getItemId,
    isFormulaTableCalculation,
    isSqlTableCalculation,
    isTemplateTableCalculation,
    NumberSeparator,
    TableCalculationType,
    type CustomFormat,
    type GeneratedFormulaTableCalculation,
    type TableCalculation,
    type TableCalculationTemplate,
} from '@lightdash/common';
import { SUPPORTED_DIALECTS, type Dialect } from '@lightdash/formula';
import {
    Accordion,
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    Loader,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
    type ComboboxItem,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import {
    Icon123,
    IconAbc,
    IconCalendar,
    IconCalculator,
    IconClockHour4,
    IconMaximize,
    IconMinimize,
    IconToggleLeft,
    IconWand,
} from '@tabler/icons-react';
import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import { useParams } from 'react-router';
import { useToggle } from 'react-use';
import { type ValueOf } from 'type-fest';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { FormatForm } from '../../../components/Explorer/FormatForm';
import { getFormatSummary } from '../../../components/Explorer/FormatForm/getFormatSummary';
import {
    selectCustomDimensions,
    selectMetricQuery,
    selectTableCalculations,
    selectTableName,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useHealth from '../../../hooks/health/useHealth';
import useToaster from '../../../hooks/toaster/useToaster';
import { useConvertSqlToFormula } from '../../../hooks/useConvertSqlToFormula';
import { useExplore } from '../../../hooks/useExplore';
import { useProject } from '../../../hooks/useProject';
import { getUniqueTableCalculationName } from '../utils';
import { FormulaForm } from './FormulaForm/FormulaForm';
import classes from './TableCalculationModal.module.css';
import { TemplateViewer } from './TemplateViewer/TemplateViewer';

const SqlForm = lazy(() =>
    import('./SqlForm').then((module) => ({ default: module.SqlForm })),
);

export type TableCalculationSaveMeta = {
    mode: 'sql' | 'template' | 'formula';
    generatedByAi: boolean;
};

type Props = {
    opened: boolean;
    onClose: () => void;
    tableCalculation?: TableCalculation;
    onSave: (
        tableCalculation: TableCalculation,
        meta: TableCalculationSaveMeta,
    ) => void;
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

const tableCalculationTypeMeta = {
    [TableCalculationType.NUMBER]: {
        label: 'Number',
        icon: Icon123,
    },
    [TableCalculationType.STRING]: {
        label: 'String',
        icon: IconAbc,
    },
    [TableCalculationType.DATE]: {
        label: 'Date',
        icon: IconCalendar,
    },
    [TableCalculationType.TIMESTAMP]: {
        label: 'Timestamp',
        icon: IconClockHour4,
    },
    [TableCalculationType.BOOLEAN]: {
        label: 'Boolean',
        icon: IconToggleLeft,
    },
} as const satisfies Record<
    TableCalculationType,
    { label: string; icon: typeof Icon123 }
>;

const TableCalculationModal: FC<Props> = ({
    opened,
    tableCalculation,
    onSave,
    onClose,
}) => {
    const [isExpanded, toggleExpanded] = useToggle(false);

    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(projectUuid);
    const { data: health } = useHealth();

    // Formula support is pinned to what the formula package can compile for
    // this warehouse. The backend mapper throws for unsupported adapters, so
    // we must not offer the input mode here either.
    const isFormulaSupported =
        !!project?.warehouseConnection &&
        (SUPPORTED_DIALECTS as readonly string[]).includes(
            project.warehouseConnection.type as Dialect,
        );

    const isAmbientAiEnabled = health?.ai?.isAmbientAiEnabled === true;

    const isNewCalculation = !tableCalculation;
    const hasTemplate = tableCalculation
        ? isTemplateTableCalculation(tableCalculation)
        : false;
    const hasFormula = tableCalculation
        ? isFormulaTableCalculation(tableCalculation)
        : false;
    // Editing an existing calc: lock to its own mode (can't map SQL back to
    // formula, and switching would throw away the user's work). New calc:
    // Formula when the warehouse supports it, SQL otherwise.
    const defaultMode = tableCalculation
        ? hasFormula
            ? EditMode.FORMULA
            : hasTemplate
              ? EditMode.TEMPLATE
              : EditMode.SQL
        : isFormulaSupported
          ? EditMode.FORMULA
          : EditMode.SQL;
    const [editMode, setEditMode] = useState<EditMode>(defaultMode);

    useEffect(() => {
        if (isNewCalculation && isFormulaSupported) {
            setEditMode(EditMode.FORMULA);
        }
    }, [isNewCalculation, isFormulaSupported]);

    const { addToastError } = useToaster();

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
                    ? tableCalculation.formula
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

    const [sqlGeneratedByAi, setSqlGeneratedByAi] = useState(false);
    const [formulaGeneratedByAi, setFormulaGeneratedByAi] = useState(false);

    useEffect(() => {
        if (opened) {
            setSqlGeneratedByAi(false);
            setFormulaGeneratedByAi(false);
        }
    }, [opened]);

    const handleSqlAiApplied = useCallback(() => {
        setSqlGeneratedByAi(true);
    }, []);

    const handleFormulaAiApply = useCallback(
        (result: GeneratedFormulaTableCalculation) => {
            const f = result.formula.startsWith('=')
                ? result.formula
                : `=${result.formula}`;
            form.setFieldValue('formula', f);
            if (!form.values.name.trim() && result.displayName) {
                form.setFieldValue('name', result.displayName);
            }
            if (
                form.values.type === TableCalculationType.NUMBER &&
                result.type &&
                result.type !== TableCalculationType.NUMBER
            ) {
                form.setFieldValue('type', result.type);
            }
            if (
                form.values.format.type === CustomFormatType.DEFAULT &&
                result.format &&
                result.format.type !== CustomFormatType.DEFAULT
            ) {
                form.setFieldValue('format', result.format);
            }
            setFormulaGeneratedByAi(true);
        },
        [form],
    );

    const {
        convert: convertSqlToFormula,
        reset: resetConversion,
        result: conversionResult,
        isLoading: isConvertingSql,
        error: conversionError,
    } = useConvertSqlToFormula({
        projectUuid,
        explore,
        metricQuery,
    });

    const isExistingSqlCalc =
        !!tableCalculation && isSqlTableCalculation(tableCalculation);
    const showConvertToFormulaButton =
        isExistingSqlCalc &&
        isFormulaSupported &&
        isAmbientAiEnabled &&
        editMode === EditMode.SQL;

    const showConversionPreview =
        editMode === EditMode.SQL &&
        (isConvertingSql || !!conversionResult || !!conversionError);

    useEffect(() => {
        if (!opened) {
            resetConversion();
        }
    }, [opened, resetConversion]);

    const handleConvertClick = useCallback(() => {
        convertSqlToFormula(form.values.sql);
    }, [convertSqlToFormula, form.values.sql]);

    const handleConvertApply = useCallback(() => {
        if (!conversionResult) return;
        // Convert is a transliteration of SQL → formula: only swap the
        // expression. Name, result type, and display format were already
        // chosen by the user on the existing SQL calc — keep them.
        setEditMode(EditMode.FORMULA);
        const f = conversionResult.formula.startsWith('=')
            ? conversionResult.formula
            : `=${conversionResult.formula}`;
        form.setFieldValue('formula', f);
        setFormulaGeneratedByAi(true);
        resetConversion();
    }, [conversionResult, form, resetConversion]);

    const handleConvertDiscard = useCallback(() => {
        resetConversion();
    }, [resetConversion]);

    const handleConvertRetry = useCallback(() => {
        convertSqlToFormula(form.values.sql);
    }, [convertSqlToFormula, form.values.sql]);

    const isFormulaInvalid =
        editMode === EditMode.FORMULA &&
        (!form.values.formula ||
            form.values.formula.trim().length === 0 ||
            formulaParseError !== null);

    const handleConfirm = useCallback(() => {
        const validation = form.validate();
        if (validation.hasErrors) return;

        const { name, sql, formula, format, type } = form.values;
        if (name.length === 0) {
            addToastError({
                title: 'Name cannot be empty',
                key: 'table-calculation-modal',
            });
            return;
        }
        try {
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
                finalName = tableCalculation.name;
            }

            if (
                editMode === EditMode.TEMPLATE &&
                tableCalculation &&
                isTemplateTableCalculation(tableCalculation)
            ) {
                onSave(
                    {
                        name: finalName,
                        displayName: name,
                        format,
                        type,
                        template: editedTemplate ?? tableCalculation.template,
                    },
                    { mode: 'template', generatedByAi: false },
                );
            } else if (editMode === EditMode.FORMULA) {
                onSave(
                    {
                        name: finalName,
                        displayName: name,
                        format,
                        type,
                        formula,
                    },
                    {
                        mode: 'formula',
                        generatedByAi: formulaGeneratedByAi,
                    },
                );
            } else {
                onSave(
                    {
                        name: finalName,
                        displayName: name,
                        format,
                        type,
                        sql,
                    },
                    {
                        mode: 'sql',
                        generatedByAi: sqlGeneratedByAi,
                    },
                );
            }
        } catch (e) {
            addToastError({
                title: 'Error saving',
                subtitle: getErrorMessage(e),
                key: 'table-calculation-modal',
            });
        }
    }, [
        form,
        editMode,
        tableCalculation,
        tableCalculations,
        editedTemplate,
        sqlGeneratedByAi,
        formulaGeneratedByAi,
        onSave,
        addToastError,
    ]);

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

    const handleTemplateChange = useCallback(
        (updated: TableCalculationTemplate) => {
            setEditedTemplate(updated);
        },
        [],
    );

    const tableCalculationTypeValues = useMemo(
        () => Object.values(TableCalculationType),
        [],
    );

    const tableCalculationTypeOptions = useMemo(
        () =>
            tableCalculationTypeValues.map((value) => ({
                value,
                label: tableCalculationTypeMeta[value].label,
            })),
        [tableCalculationTypeValues],
    );

    const selectedTableCalculationType =
        form.values.type ?? TableCalculationType.NUMBER;
    const selectedTypeMeta =
        tableCalculationTypeMeta[selectedTableCalculationType];

    const renderTypeOption = useCallback(
        ({ option }: { option: ComboboxItem }) => {
            const meta =
                tableCalculationTypeMeta[option.value as TableCalculationType];

            return (
                <Group gap="xs" wrap="nowrap">
                    <Box className={classes.typeOptionIcon}>
                        <MantineIcon icon={meta.icon} size="sm" />
                    </Box>
                    <Text size="sm" fw={500}>
                        {meta.label}
                    </Text>
                </Group>
            );
        },
        [],
    );

    const handleTypeChange = useCallback(
        (value: string | null) => {
            if (
                value &&
                tableCalculationTypeValues.includes(
                    value as TableCalculationType,
                )
            ) {
                form.setFieldValue('type', value as TableCalculationType);
            }
        },
        [form, tableCalculationTypeValues],
    );

    const editModeOptions = useMemo(
        () => [
            {
                value: EditMode.FORMULA,
                label: (
                    <Group
                        gap={4}
                        wrap="nowrap"
                        justify="center"
                        className={classes.inputModeFormulaLabel}
                    >
                        <Text span inherit>
                            Formula
                        </Text>
                        <Tooltip label="This feature is currently in beta. It might cause unexpected results and is subject to change.">
                            <Badge
                                color="indigo"
                                radius="sm"
                                className={classes.inputModeBadge}
                            >
                                Beta
                            </Badge>
                        </Tooltip>
                    </Group>
                ),
            },
            { value: EditMode.SQL, label: 'SQL' },
        ],
        [],
    );

    const saveButtonLabel = tableCalculation
        ? 'Save changes'
        : editMode === EditMode.FORMULA
          ? 'Create formula'
          : 'Create SQL calculation';

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={`${tableCalculation ? 'Edit' : 'Create'} Table Calculation`}
            icon={IconCalculator}
            size={isExpanded ? 'auto' : 'xl'}
            headerActions={
                <Tooltip label={isExpanded ? 'Collapse' : 'Expand'}>
                    <ActionIcon
                        variant="subtle"
                        onClick={toggleExpanded}
                        color="gray"
                    >
                        <MantineIcon
                            icon={isExpanded ? IconMinimize : IconMaximize}
                        />
                    </ActionIcon>
                </Tooltip>
            }
            actions={
                <Button
                    onClick={handleConfirm}
                    data-testid="table-calculation-save-button"
                    disabled={
                        (editMode === EditMode.SQL &&
                            form.values.sql.length === 0) ||
                        isFormulaInvalid
                    }
                >
                    {saveButtonLabel}
                </Button>
            }
            cancelLabel="Cancel"
            modalRootProps={{
                closeOnClickOutside: false,
                styles: isExpanded
                    ? {
                          content: {
                              minWidth: '90vw',
                              height: '80vh',
                              maxHeight: '90vh',
                          },
                      }
                    : undefined,
            }}
        >
            <Stack gap="lg">
                <Group gap="md" align="flex-start">
                    <TextInput
                        label="Name"
                        required
                        placeholder="E.g. Cumulative order count"
                        data-testid="table-calculation-name-input"
                        flex={2}
                        {...form.getInputProps('name')}
                    />
                    <Select
                        label="Data type"
                        flex={1}
                        {...form.getInputProps('type')}
                        onChange={handleTypeChange}
                        data={tableCalculationTypeOptions}
                        allowDeselect={false}
                        leftSection={
                            <MantineIcon
                                icon={selectedTypeMeta.icon}
                                size="sm"
                                className={classes.typeInputIcon}
                            />
                        }
                        renderOption={renderTypeOption}
                        checkIconPosition="right"
                    />
                </Group>

                <Stack gap="xs">
                    <Group className={classes.inputModeHeader}>
                        <Text fz="sm" fw={600}>
                            Input mode
                        </Text>
                        {isNewCalculation && isFormulaSupported && (
                            <SegmentedControl
                                classNames={{
                                    root: classes.inputModeControl,
                                    indicator:
                                        classes.inputModeControlIndicator,
                                    control: classes.inputModeControlItem,
                                    label: classes.inputModeControlLabel,
                                }}
                                value={editMode}
                                onChange={(value) =>
                                    setEditMode(value as EditMode)
                                }
                                data={editModeOptions}
                                size="xs"
                            />
                        )}
                        {showConvertToFormulaButton && (
                            <Tooltip
                                label="Use AI to suggest a formula equivalent of your SQL. You can review and edit it before saving."
                                withArrow
                                multiline
                                w={260}
                                disabled={showConversionPreview}
                            >
                                <Button
                                    variant="light"
                                    color="indigo"
                                    size="xs"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconWand}
                                            size="sm"
                                        />
                                    }
                                    onClick={handleConvertClick}
                                    loading={isConvertingSql}
                                    disabled={
                                        !form.values.sql ||
                                        form.values.sql.trim().length === 0
                                    }
                                    style={{
                                        visibility: showConversionPreview
                                            ? 'hidden'
                                            : 'visible',
                                    }}
                                >
                                    Convert to formula
                                </Button>
                            </Tooltip>
                        )}
                    </Group>

                    <Box
                        key={editMode}
                        className={
                            isExpanded
                                ? classes.editorContainerExpanded
                                : classes.editorContainer
                        }
                    >
                        {editMode === EditMode.TEMPLATE &&
                        tableCalculation &&
                        isTemplateTableCalculation(tableCalculation) ? (
                            <TemplateViewer
                                template={editedTemplate ?? template}
                                readOnly={false}
                                onTemplateChange={handleTemplateChange}
                            />
                        ) : editMode === EditMode.FORMULA ? (
                            <FormulaForm
                                explore={explore}
                                metricQuery={metricQuery}
                                formula={form.values.formula}
                                initialFormula={
                                    form.values.formula || undefined
                                }
                                onChange={(text) =>
                                    form.setFieldValue('formula', text)
                                }
                                onAiApply={handleFormulaAiApply}
                                onValidationChange={setFormulaParseError}
                                isFullScreen={isExpanded}
                            />
                        ) : (
                            <Box className={classes.sqlEditorBorder}>
                                <Suspense
                                    fallback={
                                        <Box
                                            className={classes.loadingFallback}
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
                                        onCmdEnter={handleConfirm}
                                        onAiApplied={handleSqlAiApplied}
                                        conversionState={
                                            showConversionPreview
                                                ? {
                                                      isLoading:
                                                          isConvertingSql,
                                                      error: conversionError,
                                                      result: conversionResult,
                                                      onApply:
                                                          handleConvertApply,
                                                      onDiscard:
                                                          handleConvertDiscard,
                                                      onRetry:
                                                          handleConvertRetry,
                                                  }
                                                : undefined
                                        }
                                    />
                                </Suspense>
                            </Box>
                        )}
                    </Box>
                </Stack>

                <Accordion
                    variant="default"
                    chevronPosition="right"
                    defaultValue={
                        form.values.format.type !== CustomFormatType.DEFAULT
                            ? 'format'
                            : null
                    }
                    classNames={{
                        item: classes.formatAccordionItem,
                        control: classes.formatAccordionControl,
                        content: classes.formatAccordionContent,
                    }}
                >
                    <Accordion.Item value="format">
                        <Accordion.Control>
                            <Group gap="md" wrap="nowrap">
                                <Text size="sm" fw={500}>
                                    Formatting
                                </Text>
                                <Text size="xs" c="dimmed" truncate>
                                    {getFormatSummary(form.values.format)}
                                </Text>
                            </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                            <FormatForm
                                formatInputProps={getFormatInputProps}
                                setFormatFieldValue={setFormatFieldValue}
                                format={form.values.format}
                            />
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>
            </Stack>
        </MantineModal>
    );
};

export default TableCalculationModal;
