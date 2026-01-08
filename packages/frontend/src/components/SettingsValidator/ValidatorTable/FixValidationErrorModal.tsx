import {
    RenameType,
    assertUnreachable,
    isChartValidationError,
    type ValidationErrorChartResponse,
    type ValidationResponse,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Checkbox,
    Code,
    Group,
    Highlight,
    Radio,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconTool } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useExplores } from '../../../hooks/useExplores';
import { useSavedQuery } from '../../../hooks/useSavedQuery';
import Callout from '../../common/Callout';
import MantineModal from '../../common/MantineModal';
import { getLinkToResource } from '../utils/utils';
import { useFieldsForChart, useRenameChart } from './hooks/useRenameResource';

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
    const { mutate: renameChart } = useRenameChart();

    const chartUuid = validationError?.chartUuid;
    const { data: fields, isError: isErrorFields } = useFieldsForChart(
        validationError?.projectUuid,
        chartUuid,
    );
    const { data: savedQuery } = useSavedQuery({ id: chartUuid });
    const { data: explores } = useExplores(validationError?.projectUuid, true);
    const [oldName, setOldName] = useState<string | undefined>();
    const [newName, setNewName] = useState('');
    const [fixAll, setFixAll] = useState(false);
    const [renameType, setRenameType] = useState<RenameType>(RenameType.FIELD);
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
                    (e.fieldName || '').startsWith(tableName ?? ''),
            ).length;
        } else {
            return assertUnreachable(
                renameType,
                `Unexpected rename type ${renameType}`,
            );
        }
    }, [validationError, allValidationErrors, renameType, savedQuery, oldName]);

    const fieldName = validationError?.fieldName;

    // Check if the field belongs to the chart's base table
    const fieldBaseTableNameCandidate = useMemo(() => {
        if (!fieldName || !savedQuery?.tableName) return '';
        if (fieldName.startsWith(savedQuery?.tableName ?? ''))
            return savedQuery?.tableName;
        return fieldName.split('_')[0];
    }, [fieldName, savedQuery?.tableName]);

    const isFieldFromBaseTable =
        fieldBaseTableNameCandidate === savedQuery?.tableName;

    if (!validationError) {
        return null;
    }

    const handleClose = () => {
        setOldName(undefined);
        setRenameType(RenameType.FIELD);
        setNewName('');
        setFixAll(false);
        form.reset();
        onClose();
    };

    const handleConfirm = form.onSubmit(() => {
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
    });

    const FIX_VALIDATION_FORM_ID = 'fix-validation-form';

    return (
        <MantineModal
            size="lg"
            title="Fix validation error"
            icon={IconTool}
            opened={!!validationError}
            onClose={handleClose}
            actions={
                <Button
                    type="submit"
                    form={FIX_VALIDATION_FORM_ID}
                    disabled={newName === ''}
                >
                    Rename
                </Button>
            }
        >
            <Text fz="sm">
                Fix{' '}
                <Text span fz="sm">
                    {validationError.source}
                </Text>{' '}
                error:{' '}
                <Anchor
                    href={getLinkToResource(
                        validationError,
                        validationError.projectUuid,
                    )}
                    target="_blank"
                >
                    <Text span fz="sm">
                        {' '}
                        {validationError?.name}
                    </Text>
                </Anchor>
            </Text>

            <Callout
                variant="info"
                title="You can rename the missing dimension by renaming the affected field or model using the drop down below."
            />

            <form id={FIX_VALIDATION_FORM_ID} onSubmit={handleConfirm}>
                <Stack>
                    <Radio.Group
                        defaultValue={RenameType.FIELD}
                        onChange={(e) => {
                            const type = e as RenameType;
                            setRenameType(type);

                            switch (type) {
                                case RenameType.FIELD:
                                    setOldName(fieldName);
                                    break;
                                case RenameType.MODEL:
                                    setOldName(fieldBaseTableNameCandidate);
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
                            <Radio value={RenameType.FIELD} label="Field" />
                            <Radio value={RenameType.MODEL} label="Model" />
                        </Group>
                    </Radio.Group>
                    {renameType === RenameType.FIELD ? (
                        <Stack>
                            <TextInput
                                disabled
                                label="Old field"
                                defaultValue={fieldName}
                                value={oldName}
                            />
                            <Tooltip
                                withinPortal
                                disabled={!isErrorFields}
                                label={`Could not find any fields on explore ${savedQuery?.tableName}. Perhaps you want to replace the model instead?`}
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
                                        radius="md"
                                        data={fieldOptions}
                                        required
                                        disabled={isErrorFields}
                                        searchable
                                        label="New field"
                                        placeholder={`Select a field to rename to`}
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
                                disabled={isFieldFromBaseTable}
                                label="Old model"
                                placeholder={
                                    isFieldFromBaseTable
                                        ? undefined
                                        : 'Enter the table name (e.g., customers)'
                                }
                                value={oldName}
                                onChange={(e) =>
                                    setOldName(e.currentTarget.value)
                                }
                            />
                            {!isFieldFromBaseTable && (
                                <Text size="xs" c="dimmed">
                                    The field <Code>{fieldName}</Code> doesn't
                                    belong to the base model for chart:{' '}
                                    <Code>{savedQuery?.tableName}</Code>. Enter
                                    the correct old model name to point the
                                    field to the correct model.
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
                                data={explores?.map((e) => e.name) || []}
                                required
                                searchable
                                label="New model"
                                placeholder={`Select a model to rename to`}
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
                            withinPortal
                            position="left"
                            label="Check this to rename all occurrences of this field in other charts and dashboards."
                        >
                            <Box>
                                <Checkbox
                                    size="xs"
                                    label={`Fix all occurrences (${totalOcurrences})`}
                                    checked={fixAll}
                                    onChange={(e) =>
                                        setFixAll(e.currentTarget.checked)
                                    }
                                />
                            </Box>
                        </Tooltip>
                    ) : (
                        <Text fz="xs" c="ldGray.7">
                            This {renameType} is not used in any other charts.
                        </Text>
                    )}
                </Stack>
            </form>
        </MantineModal>
    );
};
