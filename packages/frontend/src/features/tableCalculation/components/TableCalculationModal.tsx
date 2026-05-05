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
    ActionIcon,
    Anchor,
    Box,
    Button,
    CopyButton,
    Divider,
    Group,
    HoverCard,
    Loader,
    Popover,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import {
    IconAlertTriangle,
    IconCalculator,
    IconCheck,
    IconCopy,
    IconLock,
    IconMaximize,
    IconMinimize,
    IconSparkles,
    IconWand,
} from '@tabler/icons-react';
import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { useParams } from 'react-router';
import { useToggle } from 'react-use';
import { type ValueOf } from 'type-fest';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
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
import { useCannotAuthorCustomSqlTableCalculations } from '../../../hooks/user/useCannotAuthorCustomSqlTableCalculations';
import { getUniqueTableCalculationName } from '../utils';
import { FormatRow } from './FormatRow/FormatRow';
import { FormulaForm, type FormulaFormHandle } from './FormulaForm/FormulaForm';
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

    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(projectUuid);
    const { data: health } = useHealth();

    // Formula support is pinned to what the formula package can compile for
    // this warehouse — `SUPPORTED_DIALECTS` is the single source of truth
    // shared with the backend mapper.
    const isFormulaSupported =
        !!project?.warehouseConnection &&
        (SUPPORTED_DIALECTS as readonly string[]).includes(
            project.warehouseConnection.type as Dialect,
        );

    const isAmbientAiEnabled = health?.ai?.isAmbientAiEnabled === true;
    const isCustomRolesEnabled = health?.isCustomRolesEnabled === true;
    const requestContext = useMemo(() => {
        const tcLabel =
            tableCalculation?.displayName || 'this SQL table calculation';
        const chartUrl =
            typeof window !== 'undefined'
                ? window.location.href.replace(/\/edit\/?$/, '')
                : '';
        return { tcLabel, chartUrl };
    }, [tableCalculation?.displayName]);
    const accessRequestMessage = useMemo(
        () =>
            isCustomRolesEnabled
                ? `Hi! Could you grant me 'Manage custom SQL table calculations' via a custom role? I need it to edit '${requestContext.tcLabel}' on this chart: ${requestContext.chartUrl}`
                : `Hi! Could you grant me SQL access for table calculations? I need to edit '${requestContext.tcLabel}' on this chart: ${requestContext.chartUrl}`,
        [requestContext, isCustomRolesEnabled],
    );
    const changeRequestMessage = useMemo(
        () =>
            `Hi! Could you update the SQL of '${requestContext.tcLabel}' on this chart? ${requestContext.chartUrl}`,
        [requestContext],
    );

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
            if (!label || !label.trim()) return 'Name is required';

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
        validateInputOnBlur: true,
        validate: {
            name: validateName,
        },
    });

    const [formulaParseError, setFormulaParseError] = useState<string | null>(
        null,
    );
    const formulaFormRef = useRef<FormulaFormHandle>(null);

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

    const cannotAuthorSqlTcs =
        useCannotAuthorCustomSqlTableCalculations(projectUuid) === true;
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
                const normalizedFormula = formula.startsWith('=')
                    ? formula
                    : `=${formula}`;
                onSave(
                    {
                        name: finalName,
                        displayName: name,
                        format,
                        type,
                        formula: normalizedFormula,
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

    const selectedTableCalculationType =
        form.values.type ?? TableCalculationType.NUMBER;

    const handleDataTypeChange = useCallback(
        (next: TableCalculationType) => {
            const prev = form.values.type ?? TableCalculationType.NUMBER;
            // Switching to a different "format family" wipes format state —
            // a date format expression makes no sense for a number value, etc.
            const familyOf = (t: TableCalculationType) =>
                t === TableCalculationType.DATE ||
                t === TableCalculationType.TIMESTAMP
                    ? 'date'
                    : t === TableCalculationType.NUMBER
                      ? 'numeric'
                      : 'plain';
            if (familyOf(prev) !== familyOf(next)) {
                form.setFieldValue('format', {
                    type: CustomFormatType.DEFAULT,
                    separator: NumberSeparator.DEFAULT,
                });
            }
            form.setFieldValue('type', next);
        },
        [form],
    );

    const sqlReadOnly = cannotAuthorSqlTcs && editMode === EditMode.SQL;
    const canSwitchEditMode =
        isNewCalculation && isFormulaSupported && !cannotAuthorSqlTcs;
    const editorLabel = editMode === EditMode.FORMULA ? 'Formula' : 'SQL';
    const switchEditModeLabel =
        editMode === EditMode.FORMULA
            ? 'Use SQL instead'
            : 'Use formula instead';
    const handleSwitchEditMode = useCallback(() => {
        setEditMode(
            editMode === EditMode.FORMULA ? EditMode.SQL : EditMode.FORMULA,
        );
    }, [editMode]);

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
                        isFormulaInvalid ||
                        sqlReadOnly
                    }
                >
                    {saveButtonLabel}
                </Button>
            }
            cancelLabel="Cancel"
            bodyScrollAreaMaxHeight={
                isExpanded ? 'calc(95vh - 140px)' : 'calc(78vh - 140px)'
            }
            modalRootProps={{
                closeOnClickOutside: false,
                styles: isExpanded
                    ? {
                          content: {
                              minWidth: '90vw',
                          },
                      }
                    : undefined,
            }}
        >
            <Stack gap="xs">
                <Stack gap={2}>
                    <Group className={classes.inputModeHeader}>
                        <Group gap={6} wrap="nowrap">
                            <Text fz="sm" fw={600}>
                                {editorLabel}
                            </Text>
                            {editMode === EditMode.FORMULA &&
                                formulaParseError && (
                                    <HoverCard
                                        withArrow
                                        width={320}
                                        position="bottom-start"
                                        shadow="md"
                                        openDelay={100}
                                        closeDelay={150}
                                    >
                                        <HoverCard.Target>
                                            <Box style={{ display: 'flex' }}>
                                                <MantineIcon
                                                    icon={IconAlertTriangle}
                                                    color="red.6"
                                                    size="sm"
                                                />
                                            </Box>
                                        </HoverCard.Target>
                                        <HoverCard.Dropdown>
                                            <Stack gap="xs">
                                                <Text
                                                    size="xs"
                                                    c="red.7"
                                                    style={{
                                                        wordBreak: 'break-word',
                                                        whiteSpace: 'pre-wrap',
                                                    }}
                                                >
                                                    {formulaParseError}
                                                </Text>
                                                {isAmbientAiEnabled && (
                                                    <Group justify="flex-end">
                                                        <Button
                                                            size="compact-xs"
                                                            variant="default"
                                                            leftSection={
                                                                <MantineIcon
                                                                    icon={
                                                                        IconSparkles
                                                                    }
                                                                    size="sm"
                                                                />
                                                            }
                                                            onClick={() =>
                                                                formulaFormRef.current?.fixWithAi(
                                                                    formulaParseError,
                                                                )
                                                            }
                                                        >
                                                            Fix with AI
                                                        </Button>
                                                    </Group>
                                                )}
                                            </Stack>
                                        </HoverCard.Dropdown>
                                    </HoverCard>
                                )}
                        </Group>
                        {canSwitchEditMode && (
                            <Anchor
                                size="xs"
                                c="dimmed"
                                onClick={handleSwitchEditMode}
                                className={classes.switchEditModeLink}
                            >
                                {switchEditModeLabel}
                            </Anchor>
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
                                    size="compact-xs"
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
                                ref={formulaFormRef}
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
                            <Box
                                className={classes.sqlEditorBorder}
                                pos="relative"
                            >
                                {sqlReadOnly && !showConversionPreview && (
                                    <Box
                                        pos="absolute"
                                        top={8}
                                        right={8}
                                        style={{ zIndex: 5 }}
                                    >
                                        <Popover
                                            position="bottom-end"
                                            withArrow
                                            shadow="md"
                                            width={300}
                                        >
                                            <Popover.Target>
                                                <Button
                                                    variant="default"
                                                    size="compact-xs"
                                                    leftSection={
                                                        <MantineIcon
                                                            icon={IconLock}
                                                            size="sm"
                                                        />
                                                    }
                                                >
                                                    View only
                                                </Button>
                                            </Popover.Target>
                                            <Popover.Dropdown>
                                                <Stack gap="xs">
                                                    <Text size="xs" fw={600}>
                                                        You don't have
                                                        permission to edit SQL
                                                        here.
                                                    </Text>
                                                    <Text size="xs" c="dimmed">
                                                        Use formulas instead —
                                                        no SQL required,
                                                        validated as you type,
                                                        and they work in any
                                                        warehouse.
                                                    </Text>
                                                    {showConvertToFormulaButton && (
                                                        <Button
                                                            size="compact-xs"
                                                            variant="light"
                                                            color="indigo"
                                                            leftSection={
                                                                <MantineIcon
                                                                    icon={
                                                                        IconWand
                                                                    }
                                                                    size="sm"
                                                                />
                                                            }
                                                            onClick={
                                                                handleConvertClick
                                                            }
                                                            loading={
                                                                isConvertingSql
                                                            }
                                                            disabled={
                                                                !form.values
                                                                    .sql ||
                                                                form.values.sql.trim()
                                                                    .length ===
                                                                    0
                                                            }
                                                            fullWidth
                                                        >
                                                            Convert to formula
                                                        </Button>
                                                    )}
                                                    <Divider
                                                        my={2}
                                                        label="or"
                                                        labelPosition="center"
                                                    />
                                                    <Text size="xs" c="dimmed">
                                                        Ask an admin or
                                                        developer
                                                        {isCustomRolesEnabled ? (
                                                            <>
                                                                {' '}
                                                                to grant{' '}
                                                                <Text
                                                                    component="span"
                                                                    fw={600}
                                                                    inherit
                                                                >
                                                                    Manage
                                                                    custom SQL
                                                                    table
                                                                    calculations
                                                                </Text>{' '}
                                                                via a custom
                                                                role.
                                                            </>
                                                        ) : (
                                                            ' for SQL access.'
                                                        )}
                                                    </Text>
                                                    <CopyButton
                                                        value={
                                                            accessRequestMessage
                                                        }
                                                        timeout={2000}
                                                    >
                                                        {({ copied, copy }) => (
                                                            <Button
                                                                size="compact-xs"
                                                                variant="default"
                                                                color={
                                                                    copied
                                                                        ? 'teal'
                                                                        : undefined
                                                                }
                                                                leftSection={
                                                                    <MantineIcon
                                                                        icon={
                                                                            copied
                                                                                ? IconCheck
                                                                                : IconCopy
                                                                        }
                                                                        size="sm"
                                                                    />
                                                                }
                                                                onClick={copy}
                                                            >
                                                                {copied
                                                                    ? 'Copied!'
                                                                    : 'Copy access request'}
                                                            </Button>
                                                        )}
                                                    </CopyButton>
                                                    <CopyButton
                                                        value={
                                                            changeRequestMessage
                                                        }
                                                        timeout={2000}
                                                    >
                                                        {({ copied, copy }) => (
                                                            <Button
                                                                size="compact-xs"
                                                                variant="default"
                                                                color={
                                                                    copied
                                                                        ? 'teal'
                                                                        : undefined
                                                                }
                                                                leftSection={
                                                                    <MantineIcon
                                                                        icon={
                                                                            copied
                                                                                ? IconCheck
                                                                                : IconCopy
                                                                        }
                                                                        size="sm"
                                                                    />
                                                                }
                                                                onClick={copy}
                                                            >
                                                                {copied
                                                                    ? 'Copied!'
                                                                    : 'Copy SQL change request'}
                                                            </Button>
                                                        )}
                                                    </CopyButton>
                                                </Stack>
                                            </Popover.Dropdown>
                                        </Popover>
                                    </Box>
                                )}
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
                                        readOnly={sqlReadOnly}
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

                <FormatRow
                    format={form.values.format}
                    formatInputProps={getFormatInputProps}
                    setFormatFieldValue={setFormatFieldValue}
                    dataType={selectedTableCalculationType}
                    onDataTypeChange={handleDataTypeChange}
                />

                <TextInput
                    label="Name"
                    required
                    placeholder="E.g. Cumulative order count"
                    data-testid="table-calculation-name-input"
                    {...form.getInputProps('name')}
                />
            </Stack>
        </MantineModal>
    );
};

export default TableCalculationModal;
