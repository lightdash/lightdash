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
    Group,
    Select,
    Stack,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconMaximize,
    IconMinimize,
    IconSparkles,
    IconSql,
} from '@tabler/icons-react';
import { useMemo, useRef, type FC } from 'react';
import { useToggle } from 'react-use';
import {
    AiCustomDimensionInputBody,
    AiSlot,
} from '../../../ee/features/ambientAi/components/tableCalculation';
import { useAmbientAiEnabled } from '../../../ee/features/ambientAi/hooks/useAmbientAiEnabled';
import {
    explorerActions,
    selectCustomDimensions,
    selectTableCalculations,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { SqlEditor } from '../../../features/tableCalculation/components/SqlForm';
import useToaster from '../../../hooks/toaster/useToaster';
import { useEditorTheme } from '../../../hooks/useEditorTheme';
import { useCustomDimensionsAceEditorCompleter } from '../../../hooks/useExplorerAceEditorCompleter';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import classes from './CustomSqlDimensionModal.module.css';

type FormValues = {
    customDimensionLabel: string;
    sql: string;
    dimensionType: DimensionType;
};
const generateCustomSqlDimensionId = (label: string) => snakeCaseName(label);

/**
 * Walkthrough action for manage:CustomFields: creating a custom SQL
 * dimension on a saved chart being edited.
 */
const createTourAction = {
    'data-tour-scope': 'manage:CustomFields',
    'data-tour-step': '2',
    'data-tour-route': '/projects/:projectUuid/saved/:savedQueryUuid/edit',
    'data-tour-label': 'Create the dimension',
    'data-tour-title': 'Add a custom SQL dimension',
    'data-tour-interactive': 'true',
    'data-tour-via':
        '[data-tour-nav="browse"] >> [data-tour-nav="all-charts"] >> [data-tour-anchor="chart-row"][data-tour-value="Orders over time"] >> [data-tour-anchor="edit-chart"] >> [data-tour-anchor="add-custom-dimension"] >> [data-tour-anchor="custom-dimension-label"] >> [data-tour-anchor="custom-dimension-sql"]',
    'data-tour-then': '[data-tour-anchor="run-query"]',
    'data-tour-docs': 'explore/create-custom-fields.mdx#custom-sql:2',
};

export const CustomSqlDimensionModal: FC<{
    isEditing: boolean;
    table: string;
    item?: CustomSqlDimension;
}> = ({ isEditing, table, item }) => {
    const { ace: aceTheme } = useEditorTheme();

    const { showToastSuccess, showToastError } = useToaster();
    const { setAceEditor } = useCustomDimensionsAceEditorCompleter();
    const isAmbientAiEnabled = useAmbientAiEnabled();

    const dispatch = useExplorerDispatch();
    const customDimensions = useExplorerSelector(selectCustomDimensions);
    const tableCalculations = useExplorerSelector(selectTableCalculations);

    const toggleModal = () =>
        dispatch(explorerActions.toggleCustomDimensionModal());
    const [isExpanded, toggleExpanded] = useToggle(false);
    const submitButtonRef = useRef<HTMLButtonElement>(null);

    const initialValues = useMemo<FormValues>(
        () =>
            isEditing && item
                ? {
                      customDimensionLabel: item.name,
                      sql: item.sql,
                      dimensionType: item.dimensionType,
                  }
                : {
                      customDimensionLabel: '',
                      sql: '',
                      dimensionType: DimensionType.STRING,
                  },
        [isEditing, item],
    );

    const form = useForm<FormValues>({
        initialValues,
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
            confirmBeforeClose={form.isDirty()}
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
                    {...(isEditing ? {} : createTourAction)}
                >
                    {isEditing ? 'Save changes' : 'Create'}
                </Button>
            }
        >
            <form
                id="custom-sql-dimension-form"
                onSubmit={handleOnSubmit}
                // Walkthrough look at the form once it opens.
                data-tour-scope="manage:CustomFields"
                data-tour-look="1"
                data-tour-after='[data-tour-anchor="add-custom-dimension"]'
                data-tour-label="A custom SQL dimension reads straight from the warehouse"
                data-tour-docs="explore/create-custom-fields.mdx#custom-sql:1"
            >
                <Stack gap="xs">
                    <Group justify="space-between">
                        <TextInput
                            label="Label"
                            required
                            placeholder="Enter custom dimension label"
                            flex={1}
                            {...form.getInputProps('customDimensionLabel')}
                            data-testid="CustomSqlDimensionModal/LabelInput"
                            // Typed anchor for scope walkthroughs (data-tour-via)
                            data-tour-anchor="custom-dimension-label"
                            data-tour-hint="Name the dimension"
                            data-tour-input="true"
                            data-tour-suggest="Order size"
                        />
                        <Select
                            className={classes.dimensionTypeSelect}
                            label="Dimension Type"
                            data={Object.values(DimensionType).map((type) => ({
                                value: type,
                                label: capitalize(type),
                            }))}
                            {...form.getInputProps('dimensionType')}
                        />
                    </Group>

                    <Box
                        // Typed anchor for scope walkthroughs: the SQL editor.
                        data-tour-anchor="custom-dimension-sql"
                        data-tour-hint="Write the SQL"
                        data-tour-input="true"
                        data-tour-suggest="CASE WHEN ${orders.amount} < 100 THEN 'small' ELSE 'large' END"
                    >
                        <SqlEditor
                            mode="sql"
                            placeholder="Enter SQL"
                            theme={aceTheme}
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
                            gutterBackgroundColor={
                                'var(--mantine-color-ldGray-1)'
                            }
                            {...form.getInputProps('sql')}
                        />
                    </Box>

                    {isAmbientAiEnabled && (
                        <AiSlot
                            icon={IconSparkles}
                            iconColor="indigo.4"
                            title="Generate and improve your custom dimension with AI"
                        >
                            <AiCustomDimensionInputBody
                                currentSql={form.values.sql || undefined}
                                onApply={(result) => {
                                    form.setFieldValue('sql', result.sql);
                                    form.setFieldValue(
                                        'customDimensionLabel',
                                        result.displayName,
                                    );
                                    form.setFieldValue(
                                        'dimensionType',
                                        result.dimensionType,
                                    );
                                }}
                            />
                        </AiSlot>
                    )}
                </Stack>
            </form>
        </MantineModal>
    );
};
