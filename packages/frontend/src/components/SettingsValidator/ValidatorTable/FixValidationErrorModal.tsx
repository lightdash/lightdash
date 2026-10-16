import {
    assertUnreachable,
    isChartValidationError,
    RenameType,
    ValidationErrorType,
    type ApiRenameResponse,
    type ValidationErrorChartResponse,
    type ValidationResponse,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Checkbox,
    Group,
    Highlight,
    List,
    Radio,
    ScrollArea,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconTool } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useExplores } from '../../../hooks/useExplores';
import { useSavedQuery } from '../../../hooks/useSavedQuery';
import Callout from '../../common/Callout';
import MantineModal from '../../common/MantineModal';
import { resolveModelNameFromField } from '../utils/resolveModelName';
import { getLinkToResource } from '../utils/utils';
import {
    useFieldsForChart,
    usePreviewRename,
    useRenameChart,
} from './hooks/useRenameResource';

type Props = {
    validationError: ValidationErrorChartResponse | undefined; // At the moment we can only fix chart errors
    allValidationErrors: ValidationResponse[] | undefined;
    onClose: () => void;
};
export const FixValidationErrorModal: FC<Props> = ({
    validationError,
    allValidationErrors,
    onClose,
}) => {
    const { t } = useTranslation('projectSettings');
    const { mutate: renameChart } = useRenameChart();
    const { mutate: previewRename, isLoading: isPreviewLoading } =
        usePreviewRename();

    const chartUuid = validationError?.chartUuid;
    const { data: fields, isError: isErrorFields } = useFieldsForChart(
        validationError?.projectUuid,
        chartUuid,
    );
    const { data: savedQuery } = useSavedQuery({
        uuidOrSlug: chartUuid,
        projectUuid: validationError?.projectUuid,
    });
    const { data: explores } = useExplores(validationError?.projectUuid, true);
    // Model-level errors (whole explore deleted or failed to compile) have no
    // fieldName to rename — default those straight to model rename.
    const isModelError =
        validationError?.errorType === ValidationErrorType.Model;
    const [oldName, setOldName] = useState<string | undefined>(() =>
        isModelError ? validationError?.tableName : undefined,
    );
    const [newName, setNewName] = useState('');
    const [fixAll, setFixAll] = useState(false);
    const [renameType, setRenameType] = useState<RenameType>(() =>
        isModelError ? RenameType.MODEL : RenameType.FIELD,
    );
    const [previewData, setPreviewData] = useState<
        ApiRenameResponse['results'] | null
    >(null);
    const form = useForm<{}>();

    const [search, setSearch] = useState('');

    const fieldOptions = useMemo(
        () =>
            Object.entries(fields?.fields || {})
                .sort(([groupA], [groupB]) => groupA.localeCompare(groupB)) // Sort groups alphabetically
                .map(([group, items]) => ({
                    group,
                    items: items.map((item) => ({
                        value: item,
                        label: item,
                    })),
                })),
        [fields],
    );

    // Check how many occurrences of the same error there are in the rest of validation errors
    const totalOcurrences: number = useMemo(() => {
        if (
            !validationError ||
            !allValidationErrors ||
            allValidationErrors.length === 0
        )
            return 0;

        if (renameType === RenameType.FIELD) {
            return allValidationErrors.filter(
                (e) =>
                    isChartValidationError(e) &&
                    e.fieldName === validationError?.fieldName,
            ).length;
        } else if (renameType === RenameType.MODEL) {
            const tableName = oldName ?? savedQuery?.tableName;

            return allValidationErrors.filter(
                (e) =>
                    isChartValidationError(e) &&
                    (e.tableName === tableName ||
                        (e.fieldName || '').startsWith(`${tableName}_`)),
            ).length;
        } else {
            return assertUnreachable(
                renameType,
                `Unexpected rename type ${renameType}`,
            );
        }
    }, [validationError, allValidationErrors, renameType, savedQuery, oldName]);

    const fieldName = validationError?.fieldName;

    const fieldBaseTableNameCandidate = useMemo(
        () =>
            validationError?.tableName ??
            resolveModelNameFromField(
                fieldName ?? '',
                savedQuery?.tableName,
                explores?.map((e) => e.name),
            ),
        [
            validationError?.tableName,
            fieldName,
            savedQuery?.tableName,
            explores,
        ],
    );

    if (!validationError) {
        return null;
    }

    const handleClose = () => {
        setOldName(undefined);
        setRenameType(RenameType.FIELD);
        setNewName('');
        setFixAll(false);
        setPreviewData(null);
        form.reset();
        onClose();
    };

    const executeRename = () => {
        renameChart({
            from: oldName || fieldName || '',
            to: newName,
            chartUuid: validationError.chartUuid!,
            fixAll,
            projectUuid: validationError.projectUuid!,
            resourceUrl: getLinkToResource(
                validationError,
                validationError.projectUuid,
            ),
            type: renameType,
        });

        form.reset();
        handleClose();
    };

    const handleConfirm = form.onSubmit(() => {
        if (fixAll && !previewData) {
            previewRename(
                {
                    from: oldName || fieldName || '',
                    to: newName,
                    type: renameType,
                    model: savedQuery?.tableName,
                    projectUuid: validationError.projectUuid!,
                },
                {
                    onSuccess: (data) => setPreviewData(data),
                },
            );
        } else {
            executeRename();
        }
    });

    const FIX_VALIDATION_FORM_ID = 'fix-validation-form';

    const totalPreviewChanges = previewData
        ? previewData.charts.length +
          previewData.dashboards.length +
          previewData.alerts.length +
          previewData.dashboardSchedulers.length
        : 0;

    return (
        <MantineModal
            size="lg"
            title={t('validatorFix.chartModal.title')}
            icon={IconTool}
            opened={!!validationError}
            onClose={handleClose}
            actions={
                previewData ? (
                    <Group>
                        <Button
                            variant="default"
                            onClick={() => setPreviewData(null)}
                        >
                            {t('actions.back', { ns: 'common' })}
                        </Button>
                        <Button onClick={executeRename}>
                            {t('validatorFix.chartModal.confirmRename')}
                        </Button>
                    </Group>
                ) : (
                    <Button
                        type="submit"
                        form={FIX_VALIDATION_FORM_ID}
                        disabled={newName === ''}
                        loading={isPreviewLoading}
                    >
                        {fixAll
                            ? t('validatorFix.chartModal.previewChanges')
                            : t('validatorFix.common.rename')}
                    </Button>
                )
            }
        >
            <Text fz="sm">
                <Trans
                    t={t}
                    i18nKey="validatorFix.chartModal.fixError"
                    values={{ name: validationError.name }}
                    components={{
                        link: (
                            <Anchor
                                href={getLinkToResource(
                                    validationError,
                                    validationError.projectUuid,
                                )}
                                target="_blank"
                                fz="sm"
                            />
                        ),
                    }}
                />
            </Text>

            {previewData ? (
                <Stack>
                    <Callout
                        variant="warning"
                        title={t('validatorFix.chartModal.previewWarning', {
                            from: oldName || fieldName,
                            to: newName,
                            count: totalPreviewChanges,
                        })}
                    >
                        {previewData.charts.length > 0 && (
                            <>
                                <Text fw={600} fz="xs" mt="xs">
                                    {t('validatorFix.chartModal.chartsCount', {
                                        count: previewData.charts.length,
                                    })}
                                </Text>
                                <ScrollArea.Autosize mah="150px" scrollbars="y">
                                    <List size="xs">
                                        {previewData.charts.map((c) => (
                                            <List.Item key={c.uuid}>
                                                {c.name}
                                            </List.Item>
                                        ))}
                                    </List>
                                </ScrollArea.Autosize>
                            </>
                        )}
                        {previewData.dashboards.length > 0 && (
                            <>
                                <Text fw={600} fz="xs" mt="xs">
                                    {t(
                                        'validatorFix.chartModal.dashboardsCount',
                                        {
                                            count: previewData.dashboards
                                                .length,
                                        },
                                    )}
                                </Text>
                                <ScrollArea.Autosize mah="150px" scrollbars="y">
                                    <List size="xs">
                                        {previewData.dashboards.map((d) => (
                                            <List.Item key={d.uuid}>
                                                {d.name}
                                            </List.Item>
                                        ))}
                                    </List>
                                </ScrollArea.Autosize>
                            </>
                        )}
                        {previewData.alerts.length > 0 && (
                            <Text fz="xs" mt="xs">
                                {t('validatorFix.chartModal.alertsCount', {
                                    count: previewData.alerts.length,
                                })}
                            </Text>
                        )}
                        {previewData.dashboardSchedulers.length > 0 && (
                            <Text fz="xs" mt="xs">
                                {t('validatorFix.chartModal.schedulersCount', {
                                    count: previewData.dashboardSchedulers
                                        .length,
                                })}
                            </Text>
                        )}
                    </Callout>
                    {totalPreviewChanges === 0 && (
                        <Text fz="sm" c="dimmed">
                            {t('validatorFix.chartModal.noOtherResources')}
                        </Text>
                    )}
                </Stack>
            ) : (
                <>
                    <Callout
                        variant="info"
                        title={t('validatorFix.chartModal.info')}
                    />

                    <form id={FIX_VALIDATION_FORM_ID} onSubmit={handleConfirm}>
                        <Stack>
                            <Radio.Group
                                value={renameType}
                                onChange={(e) => {
                                    const type = e as RenameType;
                                    setRenameType(type);
                                    setNewName('');

                                    switch (type) {
                                        case RenameType.FIELD:
                                            setOldName(fieldName);
                                            break;
                                        case RenameType.MODEL:
                                            setOldName(
                                                fieldBaseTableNameCandidate,
                                            );
                                            break;
                                        default:
                                            assertUnreachable(
                                                type,
                                                `Unexpected rename type ${type}`,
                                            );
                                    }
                                }}
                            >
                                <Group>
                                    <Radio
                                        value={RenameType.FIELD}
                                        label={t('validatorFix.common.field')}
                                    />
                                    <Radio
                                        value={RenameType.MODEL}
                                        label={t('validatorFix.common.model')}
                                    />
                                </Group>
                            </Radio.Group>
                            {renameType === RenameType.FIELD ? (
                                <Stack>
                                    <TextInput
                                        disabled
                                        label={t(
                                            'validatorFix.common.oldField',
                                        )}
                                        defaultValue={fieldName}
                                        value={oldName}
                                    />
                                    <Tooltip
                                        disabled={!isErrorFields}
                                        label={t(
                                            'validatorFix.common.noFieldsOnExplore',
                                            {
                                                table: savedQuery?.tableName,
                                            },
                                        )}
                                    >
                                        <div>
                                            <Select
                                                renderOption={({ option }) => (
                                                    <Highlight
                                                        highlight={search}
                                                        {...option}
                                                        fz="sm"
                                                        color="yellow"
                                                    >
                                                        {option.label}
                                                    </Highlight>
                                                )}
                                                onSearchChange={setSearch}
                                                searchValue={search}
                                                data={fieldOptions}
                                                required
                                                disabled={isErrorFields}
                                                searchable
                                                value={newName || null}
                                                label={t(
                                                    'validatorFix.common.newField',
                                                )}
                                                placeholder={t(
                                                    'validatorFix.common.selectFieldPlaceholder',
                                                )}
                                                onChange={(e) => {
                                                    if (e) setNewName(e);
                                                }}
                                            />
                                        </div>
                                    </Tooltip>
                                </Stack>
                            ) : renameType === RenameType.MODEL ? (
                                <Stack>
                                    <TextInput
                                        label={t(
                                            'validatorFix.common.oldModel',
                                        )}
                                        placeholder={t(
                                            'validatorFix.chartModal.oldModelPlaceholder',
                                        )}
                                        value={oldName}
                                        onChange={(e) =>
                                            setOldName(e.currentTarget.value)
                                        }
                                    />
                                    {oldName &&
                                        savedQuery?.tableName &&
                                        oldName !== savedQuery.tableName && (
                                            <Text size="xs" c="dimmed">
                                                <Trans
                                                    t={t}
                                                    i18nKey="validatorFix.chartModal.fieldNotInBaseModel"
                                                    values={{
                                                        field: fieldName,
                                                        model: savedQuery.tableName,
                                                    }}
                                                    components={{
                                                        code: (
                                                            <Text
                                                                span
                                                                ff="monospace"
                                                                size="xs"
                                                            />
                                                        ),
                                                    }}
                                                />
                                            </Text>
                                        )}
                                    <Select
                                        searchValue={search}
                                        onSearchChange={setSearch}
                                        renderOption={({ option }) => (
                                            <Highlight
                                                highlight={search}
                                                {...option}
                                                fz="sm"
                                                color="yellow"
                                            >
                                                {option.label}
                                            </Highlight>
                                        )}
                                        data={
                                            explores?.map((e) => e.name) || []
                                        }
                                        required
                                        searchable
                                        value={newName || null}
                                        label={t(
                                            'validatorFix.common.newModel',
                                        )}
                                        placeholder={t(
                                            'validatorFix.common.selectModelPlaceholder',
                                        )}
                                        onChange={(e) => {
                                            if (e) setNewName(e);
                                        }}
                                    />
                                </Stack>
                            ) : (
                                assertUnreachable(
                                    renameType,
                                    `Unexpected rename type ${renameType}`,
                                )
                            )}
                            {totalOcurrences > 1 ? (
                                <Tooltip
                                    position="left"
                                    label={t(
                                        'validatorFix.common.fixAllTooltip',
                                    )}
                                >
                                    <Box>
                                        <Checkbox
                                            size="xs"
                                            label={t(
                                                'validatorFix.common.fixAllOccurrences',
                                                { count: totalOcurrences },
                                            )}
                                            checked={fixAll}
                                            onChange={(e) =>
                                                setFixAll(
                                                    e.currentTarget.checked,
                                                )
                                            }
                                        />
                                    </Box>
                                </Tooltip>
                            ) : (
                                <Text fz="xs" c="ldGray.7">
                                    {t(
                                        'validatorFix.chartModal.notUsedElsewhere',
                                        { context: renameType },
                                    )}
                                </Text>
                            )}
                        </Stack>
                    </form>
                </>
            )}
        </MantineModal>
    );
};
