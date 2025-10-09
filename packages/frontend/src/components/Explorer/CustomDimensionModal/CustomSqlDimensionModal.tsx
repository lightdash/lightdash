import {
    capitalize,
    convertFieldRefToFieldId,
    CustomDimensionType,
    DimensionType,
    getAllReferences,
    getItemId,
    snakeCaseName,
    type CustomSqlDimension,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    getDefaultZIndex,
    Group,
    Modal,
    Paper,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconMaximize, IconMinimize, IconSql } from '@tabler/icons-react';
import { useEffect, useRef, type FC } from 'react';
import { useToggle } from 'react-use';
import { useCustomDimensionsAutocompletions } from '../../../hooks/codemirror/useExplorerAutocompletions';
import useToaster from '../../../hooks/toaster/useToaster';
import { useExplore } from '../../../hooks/useExplore';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import { SqlEditor as CodeMirrorSqlEditor } from '../../CodeMirror';
import MantineIcon from '../../common/MantineIcon';

type FormValues = {
    customDimensionLabel: string;
    sql: string;
    dimensionType: DimensionType;
};
const generateCustomSqlDimensionId = (label: string) => snakeCaseName(label);

export const CustomSqlDimensionModal: FC<{
    isEditing: boolean;
    table: string;
    item?: CustomSqlDimension;
}> = ({ isEditing, table, item }) => {
    const theme = useMantineTheme();
    const { colors } = theme;
    const { showToastSuccess, showToastError } = useToaster();
    const toggleModal = useExplorerContext(
        (context) => context.actions.toggleCustomDimensionModal,
    );
    const customDimensions = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.customDimensions,
    );
    const tableCalculations = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.tableCalculations,
    );
    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const addCustomDimension = useExplorerContext(
        (context) => context.actions.addCustomDimension,
    );
    const editCustomDimension = useExplorerContext(
        (context) => context.actions.editCustomDimension,
    );
    const explore = useExplore(tableName);
    const autocompletions = useCustomDimensionsAutocompletions(explore.data);

    const [isExpanded, toggleExpanded] = useToggle(false);
    const submitButtonRef = useRef<HTMLButtonElement>(null);

    const form = useForm<FormValues>({
        initialValues: {
            customDimensionLabel: '',
            sql: '',
            dimensionType: DimensionType.STRING,
        },
        validate: {
            customDimensionLabel: (label) => {
                if (!label) return null;

                const customDimensionId = generateCustomSqlDimensionId(label);

                if (isEditing && item && customDimensionId === item.id) {
                    return null;
                }

                const isInvalid = [
                    ...tableCalculations,
                    ...(customDimensions ?? []),
                ].some(
                    (i) =>
                        getItemId(i).toLowerCase().trim() ===
                        customDimensionId.toLowerCase().trim(),
                );

                return isInvalid
                    ? 'Dimension/Table calculation with this label already exists'
                    : null;
            },
        },
    });

    const { setFieldValue } = form;

    useEffect(() => {
        if (isEditing && item) {
            setFieldValue('customDimensionLabel', item.name);
            setFieldValue('sql', item.sql);
            setFieldValue('dimensionType', item.dimensionType);
        }
    }, [setFieldValue, item, isEditing]);

    const handleOnSubmit = form.onSubmit((values) => {
        const sanitizedId = generateCustomSqlDimensionId(
            values.customDimensionLabel,
        );

        try {
            if (!values.sql) {
                throw new Error('SQL is required');
            }
            // Validate all references in SQL
            const fieldIds = getAllReferences(values.sql).map((ref) => {
                try {
                    return convertFieldRefToFieldId(ref);
                } catch (error) {
                    return null;
                }
            });

            if (fieldIds.some((id) => id === null)) {
                throw new Error(
                    'Invalid field references in SQL. References must be of the format "table.field", e.g "orders.id"',
                );
            }

            // Only proceed if all conversions succeeded
            let customDim: CustomSqlDimension = {
                id: sanitizedId,
                name: values.customDimensionLabel,
                table,
                type: CustomDimensionType.SQL,
                sql: values.sql,
                dimensionType: values.dimensionType,
            };

            if (isEditing && item) {
                editCustomDimension({ ...customDim, id: item.id }, item.id);
                showToastSuccess({
                    title: 'Custom dimension edited successfully',
                });
            } else {
                addCustomDimension(customDim);
                showToastSuccess({
                    title: 'Custom dimension added successfully',
                });
            }

            form.reset();
            toggleModal();
        } catch (error) {
            showToastError({
                title: 'Error creating custom dimension',
                subtitle:
                    error instanceof Error
                        ? error.message
                        : 'Invalid field reference in SQL or dimension name',
            });
        }
    });

    return (
        <Modal.Root
            opened={true}
            onClose={() => {
                toggleModal(undefined);
                form.reset();
            }}
            size="xl"
            centered
            styles={{
                content: {
                    minWidth: isExpanded ? '90vw' : 'auto',
                    height: isExpanded ? '70vh' : 'auto',
                },
            }}
        >
            <Modal.Overlay />
            <Modal.Content
                sx={{
                    margin: '0 auto',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <Modal.Header
                    sx={(themeProps) => ({
                        borderBottom: `1px solid ${themeProps.colors.gray[2]}`,
                        padding: themeProps.spacing.sm,
                    })}
                >
                    <Group spacing="xs">
                        <Paper p="xs" withBorder radius="sm">
                            <MantineIcon icon={IconSql} size="sm" />
                        </Paper>
                        <Text color="dark.7" fw={700} fz="md">
                            {isEditing ? 'Edit' : 'Create'} Custom Dimension
                            {item ? (
                                <Text span fw={400}>
                                    {' '}
                                    - {item.name}
                                </Text>
                            ) : null}
                        </Text>
                    </Group>
                    <Modal.CloseButton />
                </Modal.Header>

                <form
                    onSubmit={handleOnSubmit}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                    }}
                >
                    <Modal.Body
                        p={0}
                        sx={{
                            flex: 1,
                            overflow: 'auto',
                            height: isExpanded ? '100%' : 'auto',
                        }}
                    >
                        <Stack p="sm" spacing="xs">
                            <Group position="apart">
                                <TextInput
                                    label="Label"
                                    required
                                    placeholder="Enter custom dimension label"
                                    style={{ flex: 1 }}
                                    {...form.getInputProps(
                                        'customDimensionLabel',
                                    )}
                                    data-testid="CustomSqlDimensionModal/LabelInput"
                                />
                                <Select
                                    sx={{
                                        alignSelf: 'flex-start',
                                    }}
                                    withinPortal={true}
                                    label="Dimension Type"
                                    data={Object.values(DimensionType).map(
                                        (type) => ({
                                            value: type,
                                            label: capitalize(type),
                                        }),
                                    )}
                                    {...form.getInputProps('dimensionType')}
                                />
                            </Group>
                            <Box
                                sx={{
                                    border: `1px solid ${colors.gray[2]}`,
                                    borderRadius: theme.radius.sm,
                                }}
                            >
                                <CodeMirrorSqlEditor
                                    value={form.values.sql}
                                    onBlur={(value) =>
                                        form.setFieldValue('sql', value)
                                    }
                                    placeholder="Enter SQL"
                                    minHeight={isExpanded ? '500px' : '150px'}
                                    autocompletions={
                                        autocompletions
                                            ? [autocompletions]
                                            : undefined
                                    }
                                    wrapEnabled={true}
                                />
                            </Box>
                        </Stack>
                    </Modal.Body>

                    <Box
                        sx={(themeProps) => ({
                            borderTop: `1px solid ${themeProps.colors.gray[2]}`,
                            padding: themeProps.spacing.sm,
                            backgroundColor: themeProps.white,
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
                                    onClick={() => {
                                        toggleModal(undefined);
                                        form.reset();
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    h={32}
                                    type="submit"
                                    ref={submitButtonRef}
                                >
                                    {isEditing ? 'Save changes' : 'Create'}
                                </Button>
                            </Group>
                        </Group>
                    </Box>
                </form>
            </Modal.Content>
        </Modal.Root>
    );
};
