import {
    assertUnreachable,
    DashboardFilterValidationErrorType,
    isFixableDashboardValidationError,
    RenameType,
    type ValidationErrorDashboardResponse,
    type ValidationResponse,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Checkbox,
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
import Callout from '../../common/Callout';
import MantineModal from '../../common/MantineModal';
import { getLinkToResource } from '../utils/utils';
import {
    useFieldsForDashboard,
    useRenameDashboard,
} from './hooks/useRenameResource';

type Props = {
    validationError: ValidationErrorDashboardResponse | undefined;
    allValidationErrors: ValidationResponse[] | undefined;
    onClose: () => void;
};

export const FixDashboardFilterModal: FC<Props> = ({
    validationError,
    allValidationErrors,
    onClose,
}) => {
    const { mutate: renameDashboard } = useRenameDashboard();

    const dashboardUuid = validationError?.dashboardUuid;

    // Determine the default rename type based on the error
    const defaultRenameType =
        validationError?.dashboardFilterErrorType ===
        DashboardFilterValidationErrorType.TableDoesNotExist
            ? RenameType.MODEL
            : RenameType.FIELD;

    const [renameType, setRenameType] = useState<RenameType>(defaultRenameType);
    const [oldName, setOldName] = useState<string | undefined>();
    const [newName, setNewName] = useState('');
    const [fixAll, setFixAll] = useState(false);
    const [search, setSearch] = useState('');
    const form = useForm<{}>();

    const fieldName = validationError?.fieldName;
    const tableName = validationError?.tableName;

    // Derive the table name from fieldName for field renames
    // fieldId format: tableName_fieldName (e.g., "payments_amount")
    const fieldTableName = useMemo(() => {
        if (tableName) return tableName;
        if (!fieldName) return '';
        // Best-effort: split on first underscore
        const underscoreIndex = fieldName.indexOf('_');
        return underscoreIndex > 0
            ? fieldName.substring(0, underscoreIndex)
            : fieldName;
    }, [fieldName, tableName]);

    const { data: fields, isError: isFieldsError } = useFieldsForDashboard(
        validationError?.projectUuid,
        dashboardUuid ?? undefined,
        renameType === RenameType.FIELD ? fieldTableName : undefined,
    );

    const { data: explores } = useExplores(validationError?.projectUuid, true);

    const fieldOptions = useMemo(
        () =>
            Object.entries(fields?.fields || {})
                .sort(([groupA], [groupB]) => groupA.localeCompare(groupB))
                .map(([group, items]) => ({
                    group,
                    items: items.map((item) => ({
                        value: item,
                        label: item,
                    })),
                })),
        [fields],
    );

    // Count occurrences of the same error in other validation errors
    const totalOccurrences: number = useMemo(() => {
        if (
            !validationError ||
            !allValidationErrors ||
            allValidationErrors.length === 0
        )
            return 0;

        if (renameType === RenameType.FIELD) {
            return allValidationErrors.filter(
                (e) =>
                    isFixableDashboardValidationError(e) &&
                    e.fieldName === validationError.fieldName,
            ).length;
        } else if (renameType === RenameType.MODEL) {
            const model = oldName ?? tableName ?? fieldTableName;
            return allValidationErrors.filter(
                (e) =>
                    isFixableDashboardValidationError(e) &&
                    ((e.tableName && e.tableName === model) ||
                        (e.fieldName && e.fieldName.startsWith(`${model}_`))),
            ).length;
        } else {
            return assertUnreachable(
                renameType,
                `Unexpected rename type ${renameType}`,
            );
        }
    }, [
        validationError,
        allValidationErrors,
        renameType,
        oldName,
        tableName,
        fieldTableName,
    ]);

    if (!validationError) {
        return null;
    }

    const handleClose = () => {
        setOldName(undefined);
        setRenameType(defaultRenameType);
        setNewName('');
        setFixAll(false);
        setSearch('');
        form.reset();
        onClose();
    };

    const handleConfirm = form.onSubmit(() => {
        const fromValue =
            renameType === RenameType.FIELD
                ? oldName || fieldName || ''
                : oldName || tableName || fieldTableName || '';

        renameDashboard({
            from: fromValue,
            to: newName,
            dashboardUuid: validationError.dashboardUuid!,
            fixAll,
            projectUuid: validationError.projectUuid,
            resourceUrl: getLinkToResource(
                validationError,
                validationError.projectUuid,
            ),
            type: renameType,
        });

        form.reset();
        handleClose();
    });

    const FIX_DASHBOARD_FORM_ID = 'fix-dashboard-filter-form';

    return (
        <MantineModal
            size="lg"
            title="Fix dashboard filter error"
            icon={IconTool}
            opened={!!validationError}
            onClose={handleClose}
            actions={
                <Button
                    type="submit"
                    form={FIX_DASHBOARD_FORM_ID}
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
                filter error:{' '}
                <Anchor
                    href={getLinkToResource(
                        validationError,
                        validationError.projectUuid,
                    )}
                    target="_blank"
                >
                    <Text span fz="sm">
                        {' '}
                        {validationError.name}
                    </Text>
                </Anchor>
            </Text>

            <Callout
                variant="info"
                title="You can fix the broken filter by renaming the affected field or model using the drop down below."
            />

            <form id={FIX_DASHBOARD_FORM_ID} onSubmit={handleConfirm}>
                <Stack>
                    <Radio.Group
                        defaultValue={defaultRenameType}
                        onChange={(e) => {
                            const type = e as RenameType;
                            setRenameType(type);
                            setNewName('');
                            setSearch('');

                            switch (type) {
                                case RenameType.FIELD:
                                    setOldName(fieldName);
                                    break;
                                case RenameType.MODEL:
                                    setOldName(
                                        tableName ?? fieldTableName ?? '',
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
                                value={oldName ?? fieldName}
                            />
                            <Tooltip
                                withinPortal
                                disabled={!isFieldsError}
                                label={`Could not find any fields on explore ${fieldTableName}. Perhaps you want to replace the model instead?`}
                            >
                                <Box>
                                    <Select
                                        renderOption={({ option }) => (
                                            <Highlight
                                                highlight={search}
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
                                        disabled={isFieldsError}
                                        searchable
                                        label="New field"
                                        placeholder="Select a field to rename to"
                                        onChange={(value) => {
                                            if (value) setNewName(value);
                                        }}
                                    />
                                </Box>
                            </Tooltip>
                        </Stack>
                    ) : renameType === RenameType.MODEL ? (
                        <Stack>
                            <TextInput
                                disabled
                                label="Old model"
                                value={
                                    oldName ?? tableName ?? fieldTableName ?? ''
                                }
                            />
                            <Select
                                searchValue={search}
                                onSearchChange={setSearch}
                                renderOption={({ option }) => (
                                    <Highlight
                                        highlight={search}
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
                                placeholder="Select a model to rename to"
                                onChange={(value) => {
                                    if (value) setNewName(value);
                                }}
                            />
                        </Stack>
                    ) : (
                        assertUnreachable(
                            renameType,
                            `Unexpected rename type ${renameType}`,
                        )
                    )}
                    {totalOccurrences > 1 ? (
                        <Tooltip
                            withinPortal
                            position="left"
                            label="Check this to rename all occurrences of this field in other charts and dashboards."
                        >
                            <Box>
                                <Checkbox
                                    size="xs"
                                    label={`Fix all occurrences (${totalOccurrences})`}
                                    checked={fixAll}
                                    onChange={(e) =>
                                        setFixAll(e.currentTarget.checked)
                                    }
                                />
                            </Box>
                        </Tooltip>
                    ) : (
                        <Text fz="xs" c="ldGray.7">
                            This {renameType} is not used in any other
                            dashboards or charts.
                        </Text>
                    )}
                </Stack>
            </form>
        </MantineModal>
    );
};
