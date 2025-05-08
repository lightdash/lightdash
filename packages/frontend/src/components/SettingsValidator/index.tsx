import {
    isChartValidationError,
    isDashboardValidationError,
    RenameType,
    type ValidationResponse,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Checkbox,
    Group,
    Loader,
    Modal,
    Paper,
    Radio,
    Select,
    Text,
    TextInput,
    Title,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconCheck } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useExplores } from '../../hooks/useExplores';
import { useSavedQuery } from '../../hooks/useSavedQuery';
import {
    useValidation,
    useValidationMutation,
} from '../../hooks/validation/useValidation';
import useApp from '../../providers/App/useApp';
import { formatTime } from '../SchedulersView/SchedulersViewUtils';
import MantineIcon from '../common/MantineIcon';
import { ValidatorTable } from './ValidatorTable';
import {
    useFieldsForChart,
    useRenameChart,
} from './ValidatorTable/hooks/useRenameResource';
import { getLinkToResource } from './utils/utils';

const MIN_ROWS_TO_ENABLE_SCROLLING = 6;

const FixValidationErrorModal: FC<{
    validationError: ValidationResponse | undefined;
    onClose: () => void;
}> = ({ validationError, onClose }) => {
    const { mutate: renameChart } = useRenameChart();

    const chartUuid =
        validationError && isChartValidationError(validationError)
            ? validationError?.chartUuid
            : undefined;
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

    const fieldOptions = useMemo(
        () =>
            Object.entries(fields || {}).flatMap(([group, items]) =>
                items.map((item) => ({
                    value: item,
                    label: item,
                    group,
                })),
            ),
        [fields],
    );
    if (!validationError) {
        return null;
    }
    const isTableError = !(
        isChartValidationError(validationError) ||
        isDashboardValidationError(validationError)
    );

    const fieldName = isTableError
        ? validationError.name
        : validationError.fieldName;

    const handleConfirm = form.onSubmit(() => {
        if (isChartValidationError(validationError)) {
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
        }

        form.reset();
        onClose();
    });

    return (
        <Modal
            title={<Title order={4}>Fix validation error</Title>}
            opened={!!validationError}
            onClose={onClose}
        >
            <Text>
                Fix{' '}
                <Text span fw={500}>
                    {validationError.source}
                </Text>{' '}
                error:
                <Anchor
                    href={getLinkToResource(
                        validationError,
                        validationError.projectUuid,
                    )}
                    target="_blank"
                >
                    <Text span fw={500}>
                        {' '}
                        {validationError?.name}
                    </Text>
                </Anchor>
            </Text>

            <Text mt="xs" mb="xs" color="gray.7" size="xs">
                You can rename the missing{' '}
                <Text span fw={500}>
                    {validationError?.errorType}
                </Text>{' '}
                by renaming the {!isTableError && 'field or'} table{' '}
                <Text span fw={500}>
                    {fieldName}
                </Text>
            </Text>

            <form onSubmit={handleConfirm}>
                <Radio.Group
                    mt="xs"
                    mb="xs"
                    defaultValue={RenameType.FIELD}
                    onChange={(e) => {
                        setRenameType(e as RenameType);

                        if (e === RenameType.MODEL) {
                            setOldName(savedQuery?.tableName);
                        } else {
                            setOldName(fieldName);
                        }
                    }}
                >
                    <Group>
                        <Radio value={RenameType.FIELD} label="Field" />
                        <Radio value={RenameType.MODEL} label="Model" />
                    </Group>
                </Radio.Group>
                {renameType === RenameType.FIELD ? (
                    <>
                        <TextInput
                            mt="xs"
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
                                    mt="xs"
                                    data={fieldOptions}
                                    required
                                    disabled={isErrorFields}
                                    searchable
                                    withinPortal
                                    label="New field"
                                    placeholder={`Select a field to rename to`}
                                    onChange={(e) => {
                                        if (e) setNewName(e);
                                    }}
                                />
                            </div>
                        </Tooltip>
                    </>
                ) : (
                    <>
                        <TextInput
                            mt="xs"
                            disabled
                            label="Old model"
                            defaultValue={fieldName}
                            value={oldName}
                        />
                        <Select
                            mt="xs"
                            data={explores?.map((e) => e.name) || []}
                            required
                            searchable
                            withinPortal
                            label="New model"
                            placeholder={`Select a model to rename to`}
                            onChange={(e) => {
                                if (e) setNewName(e);
                            }}
                        />
                    </>
                )}
                <Tooltip
                    withinPortal
                    label="Check this to rename all occurrences of this field in other charts and dashboards."
                >
                    <Group>
                        {' '}
                        <Checkbox
                            mt="xs"
                            size="xs"
                            label="Fix all occurrences"
                            checked={fixAll}
                            onChange={(e) => setFixAll(e.currentTarget.checked)}
                        />
                    </Group>
                </Tooltip>
                <Group position="right" mt="sm">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>

                    <Button type="submit">Rename</Button>
                </Group>
            </form>
        </Modal>
    );
};

export const SettingsValidator: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const theme = useMantineTheme();
    const [isValidating, setIsValidating] = useState(false);

    const { user } = useApp();
    const { data, isLoading } = useValidation(projectUuid, user, true); // Note: Users that land on this page can always manage validations
    const { mutate: validateProject } = useValidationMutation(
        projectUuid,
        () => setIsValidating(false),
        () => setIsValidating(false),
    );
    const [selectedValidationError, setSelectedValidationError] =
        useState<ValidationResponse>();
    return (
        <>
            <FixValidationErrorModal
                validationError={selectedValidationError}
                onClose={() => {
                    setSelectedValidationError(undefined);
                }}
            />
            <Text color="dimmed">
                Use the project validator to check what content is broken in
                your project.
            </Text>

            <Paper withBorder shadow="sm">
                <Group
                    position="apart"
                    p="md"
                    sx={{
                        borderBottomWidth: 1,
                        borderBottomStyle: 'solid',
                        borderBottomColor: theme.colors.gray[3],
                    }}
                >
                    <Text fw={500} fz="xs" c="gray.6">
                        {!!data?.length
                            ? `Last validated at: ${formatTime(
                                  data[0].createdAt,
                              )}`
                            : null}
                    </Text>
                    <Button
                        onClick={() => {
                            setIsValidating(true);
                            validateProject();
                        }}
                        loading={isValidating}
                    >
                        Run validation
                    </Button>
                </Group>
                <Box
                    sx={{
                        overflowY:
                            data && data.length > MIN_ROWS_TO_ENABLE_SCROLLING
                                ? 'scroll'
                                : 'auto',
                        maxHeight:
                            data && data.length > MIN_ROWS_TO_ENABLE_SCROLLING
                                ? '500px'
                                : 'auto',
                    }}
                >
                    {isLoading ? (
                        <Group position="center" spacing="xs" p="md">
                            <Loader color="gray" />
                        </Group>
                    ) : !!data?.length ? (
                        <ValidatorTable
                            data={data}
                            projectUuid={projectUuid}
                            setSelectedValidationError={
                                setSelectedValidationError
                            }
                        />
                    ) : (
                        <Group position="center" spacing="xs" p="md">
                            <MantineIcon icon={IconCheck} color="green" />
                            <Text fw={500} c="gray.7">
                                No validation errors found
                            </Text>
                        </Group>
                    )}
                </Box>
            </Paper>
        </>
    );
};
