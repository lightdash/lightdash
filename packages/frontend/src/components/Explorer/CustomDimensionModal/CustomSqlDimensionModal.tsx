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
    Button,
    Group,
    Select,
    Stack,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useMantineColorScheme } from '@mantine/core';
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
import MantineModal from '../../common/MantineModal';

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
    const { colorScheme } = useMantineColorScheme();

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

    const handleClose = () => {
        toggleModal();
        form.reset();
    };

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

    const title = item
        ? `${isEditing ? 'Edit' : 'Create'} Custom Dimension - ${item.name}`
        : `${isEditing ? 'Edit' : 'Create'} Custom Dimension`;

    return (
        <MantineModal
            opened={true}
            onClose={handleClose}
            title={title}
            icon={IconSql}
            size="xl"
            modalRootProps={{
                styles: {
                    content: {
                        minWidth: isExpanded ? '90vw' : 'auto',
                        height: isExpanded ? '70vh' : 'auto',
                    },
                },
            }}
            modalBodyProps={{
                px: 'md',
                py: 'sm',
            }}
            leftActions={
                <Tooltip label="Expand/Collapse">
                    <ActionIcon variant="outline" onClick={toggleExpanded}>
                        <MantineIcon
                            icon={isExpanded ? IconMinimize : IconMaximize}
                        />
                    </ActionIcon>
                </Tooltip>
            }
            actions={
                <Button
                    type="submit"
                    form="custom-sql-dimension-form"
                    ref={submitButtonRef}
                >
                    {isEditing ? 'Save changes' : 'Create'}
                </Button>
            }
        >
            <form id="custom-sql-dimension-form" onSubmit={handleOnSubmit}>
                <Stack gap="xs">
                    <Group justify="space-between">
                        <TextInput
                            label="Label"
                            required
                            placeholder="Enter custom dimension label"
                            style={{ flex: 1 }}
                            {...form.getInputProps('customDimensionLabel')}
                            data-testid="CustomSqlDimensionModal/LabelInput"
                        />
                        <Select
                            style={{
                                alignSelf: 'flex-start',
                            }}
                            label="Dimension Type"
                            data={Object.values(DimensionType).map((type) => ({
                                value: type,
                                label: capitalize(type),
                            }))}
                            {...form.getInputProps('dimensionType')}
                        />
                    </Group>

                    <SqlEditor
                        mode="sql"
                        placeholder="Enter SQL"
                        theme={
                            colorScheme === 'dark' ? 'tomorrow_night' : 'github'
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
                        gutterBackgroundColor={'var(--mantine-color-ldGray-1)'}
                        {...form.getInputProps('sql')}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};
