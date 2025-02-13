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
    Button,
    Group,
    Modal,
    ScrollArea,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
    useMantineTheme,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconSql } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { SqlEditor } from '../../../features/tableCalculation/components/SqlForm';
import useToaster from '../../../hooks/toaster/useToaster';
import { useCustomDimensionsAceEditorCompleter } from '../../../hooks/useExplorerAceEditorCompleter';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
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
    const { showToastSuccess, showToastError } = useToaster();
    const { setAceEditor } = useCustomDimensionsAceEditorCompleter();
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
    const addCustomDimension = useExplorerContext(
        (context) => context.actions.addCustomDimension,
    );
    const editCustomDimension = useExplorerContext(
        (context) => context.actions.editCustomDimension,
    );

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
        <Modal
            size="lg"
            onClick={(e) => e.stopPropagation()}
            opened={true}
            onClose={() => {
                toggleModal(undefined);
                form.reset();
            }}
            title={
                <>
                    <Group spacing="xs">
                        <MantineIcon icon={IconSql} size="lg" color="gray.7" />
                        <Title order={4}>
                            {isEditing ? 'Edit' : 'Create'} Custom Dimension
                            {item ? (
                                <Text span fw={400}>
                                    {' '}
                                    - {item.name}
                                </Text>
                            ) : null}
                        </Title>
                    </Group>
                </>
            }
            styles={{
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            }}
        >
            <form onSubmit={handleOnSubmit}>
                <Stack p="md" pb="xs" spacing="xs">
                    <Group position="apart">
                        <TextInput
                            label="Label"
                            required
                            placeholder="Enter custom dimension label"
                            style={{ flex: 1 }}
                            {...form.getInputProps('customDimensionLabel')}
                        />
                        <Select
                            sx={{
                                alignSelf: 'flex-start',
                            }}
                            withinPortal={true}
                            label="Dimension Type"
                            data={Object.values(DimensionType).map((type) => ({
                                value: type,
                                label: capitalize(type),
                            }))}
                            {...form.getInputProps('dimensionType')}
                        />
                    </Group>
                    <ScrollArea h={'150px'}>
                        <SqlEditor
                            mode="sql"
                            placeholder="Enter SQL"
                            theme="github"
                            width="100%"
                            maxLines={Infinity}
                            minLines={8}
                            setOptions={{
                                autoScrollEditorIntoView: true,
                            }}
                            onLoad={setAceEditor}
                            isFullScreen={false}
                            enableLiveAutocompletion
                            enableBasicAutocompletion
                            showPrintMargin={false}
                            wrapEnabled={true}
                            gutterBackgroundColor={theme.colors.gray['1']}
                            {...form.getInputProps('sql')}
                        />
                    </ScrollArea>

                    <Group>
                        <Button ml="auto" type="submit">
                            {isEditing ? 'Save changes' : 'Create'}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};
