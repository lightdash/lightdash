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
} from '@mantine/core';
import { IconTool } from '@tabler/icons-react';
import { useMemo, useState, type FC, type FormEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('projectSettings');
    const { mutate: renameDashboard } = useRenameDashboard();

    const dashboardUuid = validationError?.dashboardUuid;

    // Determine the default rename type based on the error
    const defaultRenameType =
        validationError?.dashboardFilterErrorType ===
            DashboardFilterValidationErrorType.TableDoesNotExist ||
        validationError?.dashboardFilterErrorType ===
            DashboardFilterValidationErrorType.FieldTableMismatch
            ? RenameType.MODEL
            : RenameType.FIELD;

    const [renameType, setRenameType] = useState<RenameType>(defaultRenameType);
    const [oldName, setOldName] = useState<string | undefined>();
    const [newName, setNewName] = useState('');
    const [fixAll, setFixAll] = useState(false);
    const [search, setSearch] = useState('');

    const fieldName = validationError?.fieldName;
    const tableName = validationError?.tableName;

    const { data: fields, isError: isFieldsError } = useFieldsForDashboard(
        validationError?.projectUuid,
        dashboardUuid ?? undefined,
        renameType === RenameType.FIELD ? tableName : undefined,
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
            const model = oldName ?? tableName;
            return allValidationErrors.filter(
                (e) =>
                    isFixableDashboardValidationError(e) &&
                    e.tableName === model,
            ).length;
        } else {
            return assertUnreachable(
                renameType,
                `Unexpected rename type ${renameType}`,
            );
        }
    }, [validationError, allValidationErrors, renameType, oldName, tableName]);

    if (!validationError || !dashboardUuid) {
        return null;
    }

    const handleClose = () => {
        setOldName(undefined);
        setRenameType(defaultRenameType);
        setNewName('');
        setFixAll(false);
        setSearch('');
        onClose();
    };

    const handleConfirm = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const fromValue =
            renameType === RenameType.FIELD
                ? oldName || fieldName || ''
                : oldName || tableName || '';

        renameDashboard({
            from: fromValue,
            to: newName,
            dashboardUuid,
            fixAll,
            projectUuid: validationError.projectUuid,
            resourceUrl: getLinkToResource(
                validationError,
                validationError.projectUuid,
            ),
            type: renameType,
        });

        handleClose();
    };

    const FIX_DASHBOARD_FORM_ID = 'fix-dashboard-filter-form';

    return (
        <MantineModal
            size="lg"
            title={t('validatorFix.dashboardModal.title')}
            icon={IconTool}
            opened={!!validationError}
            onClose={handleClose}
            actions={
                <Button
                    type="submit"
                    form={FIX_DASHBOARD_FORM_ID}
                    disabled={newName === ''}
                >
                    {t('validatorFix.common.rename')}
                </Button>
            }
        >
            <Text fz="sm">
                <Trans
                    t={t}
                    i18nKey="validatorFix.dashboardModal.fixError"
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

            <Callout
                variant="info"
                title={t('validatorFix.dashboardModal.info')}
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
                                    setOldName(tableName ?? '');
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
                                label={t('validatorFix.common.oldField')}
                                defaultValue={fieldName}
                                value={oldName ?? fieldName}
                            />
                            <Tooltip
                                disabled={!isFieldsError}
                                label={t(
                                    'validatorFix.common.noFieldsOnExplore',
                                    {
                                        table: tableName,
                                    },
                                )}
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
                                        data={fieldOptions}
                                        required
                                        disabled={isFieldsError}
                                        searchable
                                        label={t(
                                            'validatorFix.common.newField',
                                        )}
                                        placeholder={t(
                                            'validatorFix.common.selectFieldPlaceholder',
                                        )}
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
                                label={t('validatorFix.common.oldModel')}
                                value={oldName ?? tableName ?? ''}
                            />
                            <Select
                                data={explores?.map((e) => e.name) || []}
                                required
                                searchable
                                label={t('validatorFix.common.newModel')}
                                placeholder={t(
                                    'validatorFix.common.selectModelPlaceholder',
                                )}
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
                            position="left"
                            label={t('validatorFix.common.fixAllTooltip')}
                        >
                            <Box>
                                <Checkbox
                                    size="xs"
                                    label={t(
                                        'validatorFix.common.fixAllOccurrences',
                                        {
                                            count: totalOccurrences,
                                        },
                                    )}
                                    checked={fixAll}
                                    onChange={(e) =>
                                        setFixAll(e.currentTarget.checked)
                                    }
                                />
                            </Box>
                        </Tooltip>
                    ) : (
                        <Text fz="xs" c="ldGray.7">
                            {t('validatorFix.dashboardModal.notUsedElsewhere', {
                                context: renameType,
                            })}
                        </Text>
                    )}
                </Stack>
            </form>
        </MantineModal>
    );
};
