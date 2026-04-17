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
    type GeneratedFormulaTableCalculation,
    type TableCalculation,
    type TableCalculationTemplate,
} from '@lightdash/common';
import {
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
} from '@mantine-8/core';
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
    useEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import { useToggle } from 'react-use';
import { type ValueOf } from 'type-fest';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
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

const TableCalculationModal: FC<Props> = ({
    opened,
    tableCalculation,
    onSave,
    onClose,
}) => {
    const [isExpanded, toggleExpanded] = useToggle(false);

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

    const { addToastError } = useToaster();

    const isFormulaEnabled = useClientFeatureFlag(
        FeatureFlags.FormulaTableCalculations,
    );

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
                    ? tableCalculation.formula.replace(/^=+\s*/, '')
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

    const [formulaKey, setFormulaKey] = useState(0);

    const [formulaGeneratedByAi, setFormulaGeneratedByAi] = useState(false);
    const [sqlGeneratedByAi, setSqlGeneratedByAi] = useState(false);

    useEffect(() => {
        if (opened) {
            setFormulaGeneratedByAi(false);
            setSqlGeneratedByAi(false);
        }
    }, [opened]);

    const handleSqlAiApplied = useCallback(() => {
        setSqlGeneratedByAi(true);
    }, []);

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
                        formula: `=${formula.replace(/^=+\s*/, '')}`,
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
        formulaGeneratedByAi,
        sqlGeneratedByAi,
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

    const handleFormulaAiApply = useCallback(
        (result: GeneratedFormulaTableCalculation) => {
            form.setFieldValue('formula', result.formula);
            form.setFieldValue('name', result.displayName);
            if (result.type) {
                form.setFieldValue('type', result.type);
            }
            if (result.format) {
                form.setFieldValue('format', result.format);
            }
            setFormulaKey((k) => k + 1);
            setFormulaGeneratedByAi(true);
        },
        [form],
    );

    const tableCalculationTypeOptions = useMemo(
        () => Object.values(TableCalculationType),
        [],
    );

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

    const editModeOptions = useMemo(
        () => [
            { value: EditMode.SQL, label: 'SQL' },
            {
                value: EditMode.FORMULA,
                label: isFormulaEnabled ? (
                    'Formula'
                ) : (
                    <Group gap={6} wrap="nowrap" justify="center">
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
                    {tableCalculation ? 'Save changes' : 'Create'}
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
                    />
                </Group>

                <Stack gap="xs">
                    <Text fz="sm" fw={600}>
                        Input
                    </Text>

                    {!hasTemplate && (
                        <SegmentedControl
                            value={editMode}
                            onChange={(value) => setEditMode(value as EditMode)}
                            data={editModeOptions}
                            size="xs"
                        />
                    )}

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
                                key={formulaKey}
                                explore={explore}
                                metricQuery={metricQuery}
                                formula={form.values.formula}
                                initialFormula={
                                    form.values.formula || undefined
                                }
                                onChange={(text) =>
                                    form.setFieldValue('formula', text)
                                }
                                onValidationChange={setFormulaParseError}
                                onAiApply={handleFormulaAiApply}
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
                                    />
                                </Suspense>
                            </Box>
                        )}
                    </Box>
                </Stack>

                <FormatForm
                    formatInputProps={getFormatInputProps}
                    setFormatFieldValue={setFormatFieldValue}
                    format={form.values.format}
                />
            </Stack>
        </MantineModal>
    );
};

export default TableCalculationModal;
