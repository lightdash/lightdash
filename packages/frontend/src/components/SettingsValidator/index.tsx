import {
    assertUnreachable,
    isChartValidationError,
    RenameType,
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
    Loader,
    Modal,
    Paper,
    Radio,
    Select,
    Stack,
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
    validationError: ValidationErrorChartResponse | undefined; // At the moment we can only fix chart errors
    allValidationErrors: ValidationResponse[] | undefined;
    onClose: () => void;
}> = ({ validationError, allValidationErrors, onClose }) => {
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
                .flatMap(([group, items]) =>
                    items.map((item) => ({
                        value: item,
                        label: item,
                        group,
                    })),
                ),
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
            const tableName = savedQuery?.tableName;

            return allValidationErrors.filter(
                (e) =>
                    isChartValidationError(e) &&
                    (e.fieldName || '').startsWith(tableName || ''),
            ).length;
        } else {
            assertUnreachable(
                renameType,
                `Unexpected rename type ${renameType}`,
            );
        }
    }, [validationError, allValidationErrors, renameType, savedQuery]);

    if (!validationError) {
        return null;
    }

    const fieldName = validationError.fieldName;

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

    return (
        <Modal
            size="lg"
            title={<Title order={4}>Fix validation error</Title>}
            opened={!!validationError}
            onClose={handleClose}
            styles={() => ({
                content: { maxHeight: 'fit-content !important' },
            })}
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
                You can rename the missing dimension by renaming the affected
                field or model using the drop down below.
            </Text>

            <form onSubmit={handleConfirm}>
                <Radio.Group
                    mt="xs"
                    mb="xs"
                    defaultValue={RenameType.FIELD}
                    onChange={(e) => {
                        const type = e as RenameType;
                        setRenameType(type);

                        switch (type) {
                            case RenameType.FIELD:
                                setOldName(fieldName);
                                break;
                            case RenameType.MODEL:
                                setOldName(savedQuery?.tableName);
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
                                    itemComponent={({ label, ...others }) => (
                                        <Highlight
                                            highlight={search}
                                            {...others}
                                            highlightColor="yellow"
                                        >
                                            {label}
                                        </Highlight>
                                    )}
                                    onSearchChange={setSearch}
                                    searchValue={search}
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
                    </Stack>
                ) : renameType === RenameType.MODEL ? (
                    <Stack>
                        <TextInput
                            disabled
                            label="Old model"
                            defaultValue={fieldName}
                            value={oldName}
                        />
                        <Select
                            searchValue={search}
                            onSearchChange={setSearch}
                            itemComponent={({ label, ...others }) => (
                                <Highlight
                                    highlight={search}
                                    {...others}
                                    highlightColor="yellow"
                                >
                                    {label}
                                </Highlight>
                            )}
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
                        label="Check this to rename all occurrences of this field in other charts and dashboards."
                    >
                        <Group display={'inline-block'}>
                            <Checkbox
                                mt="xs"
                                size="xs"
                                label={`Fix all occurrences (${totalOcurrences})`}
                                checked={fixAll}
                                onChange={(e) =>
                                    setFixAll(e.currentTarget.checked)
                                }
                            />
                        </Group>
                    </Tooltip>
                ) : (
                    <Text mt="xs" size="xs" color="gray.7">
                        This {renameType} is not used in any other charts.
                    </Text>
                )}
                <Group position="right" mt="sm">
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>

                    <Button type="submit" disabled={newName === ''}>
                        Rename
                    </Button>
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
        useState<ValidationErrorChartResponse>();
    return (
        <>
            <FixValidationErrorModal
                validationError={selectedValidationError}
                allValidationErrors={data}
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
                        <>
                            <ValidatorTable
                                // Hard limit to 100 rows, otherwise it breaks the UI
                                data={data.slice(0, 100)} // TODO add pagination
                                projectUuid={projectUuid}
                                onSelectValidationError={(validationError) => {
                                    if (
                                        isChartValidationError(validationError)
                                    ) {
                                        setSelectedValidationError(
                                            validationError,
                                        );
                                    }
                                }}
                            />
                            {data.length > 100 && (
                                <Text p="md" c="gray.7">
                                    Showing only 100 of {data.length} validation
                                    errors.
                                </Text>
                            )}
                        </>
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
