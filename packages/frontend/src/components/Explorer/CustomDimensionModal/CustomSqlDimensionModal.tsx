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
import {
    explorerActions,
    selectCustomDimensions,
    selectTableCalculations,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { SqlEditor } from '../../../features/tableCalculation/components/SqlForm';
import useToaster from '../../../hooks/toaster/useToaster';
import { useCustomDimensionsAceEditorCompleter } from '../../../hooks/useExplorerAceEditorCompleter';
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
    const { colors, colorScheme } = theme;
    const { showToastSuccess, showToastError } = useToaster();
    const { setAceEditor } = useCustomDimensionsAceEditorCompleter();

    const dispatch = useExplorerDispatch();
    const customDimensions = useExplorerSelector(selectCustomDimensions);
    const tableCalculations = useExplorerSelector(selectTableCalculations);

    const toggleModal = () =>
        dispatch(explorerActions.toggleCustomDimensionModal());
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
                // Edit by updating the entire array
                const updatedDimensions = (customDimensions ?? []).map((dim) =>
                    dim.id === item.id ? { ...customDim, id: item.id } : dim,
                );
                dispatch(
                    explorerActions.setCustomDimensions(updatedDimensions),
                );
                showToastSuccess({
                    title: 'Custom dimension edited successfully',
                });
            } else {
                dispatch(explorerActions.addCustomDimension(customDim));
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
                toggleModal();
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
                        borderBottom: `1px solid ${themeProps.colors.ldGray[2]}`,
                        padding: themeProps.spacing.sm,
                    })}
                >
                    <Group spacing="xs">
                        <Paper p="xs" withBorder radius="sm">
                            <MantineIcon icon={IconSql} size="sm" />
                        </Paper>
                        <Text fw={700} fz="md">
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
                                    border: `1px solid ${colors.ldGray[2]}`,
                                    borderRadius: theme.radius.sm,
                                }}
                            >
                                <SqlEditor
                                    mode="sql"
                                    placeholder="Enter SQL"
                                    theme={
                                        colorScheme === 'dark'
                                            ? 'tomorrow_night'
                                            : 'github'
                                    }
                                    width="100%"
                                    maxLines={Infinity}
                                    minLines={isExpanded ? 25 : 8}
                                    setOptions={{
                                        autoScrollEditorIntoView: true,
                                    }}
                                    onLoad={setAceEditor}
                                    isFullScreen={isExpanded}
                                    enableLiveAutocompletion
                                    enableBasicAutocompletion
                                    showPrintMargin={false}
                                    wrapEnabled={true}
                                    gutterBackgroundColor={colors.ldGray[0]}
                                    {...form.getInputProps('sql')}
                                />
                            </Box>
                        </Stack>
                    </Modal.Body>

                    <Box
                        sx={(themeProps) => ({
                            borderTop: `1px solid ${themeProps.colors.ldGray[2]}`,
                            padding: themeProps.spacing.sm,
                            backgroundColor: themeProps.colors.background,
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
                                        toggleModal();
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
