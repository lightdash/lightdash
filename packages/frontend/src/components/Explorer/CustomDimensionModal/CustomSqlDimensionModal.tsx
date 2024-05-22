import {
    CustomDimensionType,
    DimensionType,
    getItemId,
    snakeCaseName,
    type CustomSqlDimension,
} from '@lightdash/common';
import {
    Button,
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
import { useEffect, type FC } from 'react';
import { SqlEditor } from '../../../features/tableCalculation/components/SqlForm';
import useToaster from '../../../hooks/toaster/useToaster';
import { useCustomDimensionsAceEditorCompleter } from '../../../hooks/useExplorerAceEditorCompleter';
import { useExplorerContext } from '../../../providers/ExplorerProvider';

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
    const { showToastSuccess } = useToaster();
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
                ].some((i) => getItemId(i) === customDimensionId);

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
        let customDim: CustomSqlDimension = {
            id: sanitizedId,
            name: values.customDimensionLabel,
            table,
            type: CustomDimensionType.SQL,
            sql: values.sql,
            dimensionType: values.dimensionType,
        };
        if (isEditing && item) {
            editCustomDimension(customDim, item.name);
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
                    <Title order={4}>
                        {isEditing ? 'Edit' : 'Create'} Custom Dimension
                        {item ? (
                            <Text span fw={400}>
                                {' '}
                                - {item.name}
                            </Text>
                        ) : null}
                    </Title>
                </>
            }
        >
            <form onSubmit={handleOnSubmit}>
                <Stack>
                    <TextInput
                        label="Label"
                        required
                        placeholder="Enter custom dimension label"
                        {...form.getInputProps('customDimensionLabel')}
                    />
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
                    <Select
                        withinPortal={true}
                        label="Return type"
                        data={Object.values(DimensionType)}
                        {...form.getInputProps('dimensionType')}
                    />
                    <Button ml="auto" type="submit">
                        {isEditing ? 'Save changes' : 'Create'}
                    </Button>
                </Stack>
            </form>
        </Modal>
    );
};
