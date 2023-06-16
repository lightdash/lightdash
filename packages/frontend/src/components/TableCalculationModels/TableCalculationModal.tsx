import { Button, Callout, Classes, Intent } from '@blueprintjs/core';
import {
    formatTableCalculationValue,
    NumberSeparator,
    snakeCaseName,
    TableCalculation,
    TableCalculationFormat,
    TableCalculationFormatType,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Flex,
    Select,
    Tabs,
    Text,
    TextInput,
} from '@mantine/core';
import { FC } from 'react';
import { useForm, UseFormReturn } from 'react-hook-form';
import { useToggle } from 'react-use';

import useToaster from '../../hooks/toaster/useToaster';
import { useExplorerAceEditorCompleter } from '../../hooks/useExplorerAceEditorCompleter';
import { useExplorerContext } from '../../providers/ExplorerProvider';

import SqlInput from '../ReactHookForm/SqlInput';
import {
    DialogBody,
    DialogButtons,
    FlexForm,
    FullScreenButton,
    TableCalculationDialog,
    TableCalculationSqlInputWrapper,
} from './TableCalculationModal.styles';

const SQL_PLACEHOLDER =
    // eslint-disable-next-line no-template-curly-in-string
    '${table_name.field_name} + ${table_name.metric_name}';

interface Props {
    isOpen: boolean;
    isDisabled: boolean;
    tableCalculation?: TableCalculation;
    onSave: (tableCalculation: TableCalculation) => void;
    onClose: () => void;
}

type TableCalculationFormInputs = {
    name: string;
    sql: string;
    format: TableCalculationFormat;
};

const getUniqueTableCalculationName = (
    name: string,
    tableCalculations: TableCalculation[],
): string => {
    const snakeName = snakeCaseName(name);
    const suffixes = Array.from(Array(100).keys());
    const getCalcName = (suffix: number) =>
        suffix === 0 ? snakeName : `${snakeName}_${suffix}`;

    const validSuffix = suffixes.find(
        (suffix) =>
            tableCalculations.findIndex(
                ({ name: tableCalcName }) =>
                    tableCalcName === getCalcName(suffix),
            ) === -1,
    );
    if (validSuffix === undefined) {
        throw new Error(`Table calculation ID "${name}" already exists.`);
    }
    return getCalcName(validSuffix);
};

const TableCalculationFormatForm: FC<{
    methods: UseFormReturn<TableCalculationFormInputs, object>;
}> = ({ methods }) => {
    const formatType = methods.watch(
        'format.type',
        TableCalculationFormatType.DEFAULT,
    );
    const round = methods.watch('format.round');
    const separator = methods.watch(
        'format.separator',
        NumberSeparator.COMMA_PERIOD,
    );

    //TODO this component is using Mantine components with a react-hook-form,
    //once we use mantine form we should refactor this to remove onChange methods

    return (
        <Box mt="md">
            <Flex>
                <Select
                    w={200}
                    onChange={(type) => {
                        methods.setValue(
                            'format.type',
                            type as TableCalculationFormatType,
                        );
                    }}
                    label="Type"
                    name="format.type"
                    value={formatType}
                    data={[
                        TableCalculationFormatType.DEFAULT,
                        TableCalculationFormatType.PERCENT,
                    ]}
                />

                {formatType !== TableCalculationFormatType.DEFAULT && (
                    <Text ml="md" mt={30} color="gray.6">
                        {'Looks like: '}
                        {formatTableCalculationValue(
                            {
                                name: 'preview',
                                sql: '',
                                displayName: 'preview',
                                format: methods.getValues('format'),
                            },
                            '0.75',
                        )}
                    </Text>
                )}
            </Flex>
            {formatType === TableCalculationFormatType.PERCENT && (
                <Flex mt="md">
                    <TextInput
                        w={200}
                        label="Round"
                        name="format.round"
                        placeholder="Number of decimal places"
                        value={round}
                        onChange={(r) => {
                            const number = parseInt(r.target.value);
                            if (!Number.isNaN(number)) {
                                methods.setValue('format.round', number);
                            } else {
                                methods.setValue('format.round', undefined);
                            }
                        }}
                    />
                    <Select
                        ml="md"
                        onChange={(s) => {
                            if (s)
                                methods.setValue(
                                    'format.separator',
                                    s as NumberSeparator,
                                );
                        }}
                        label="Separator style"
                        value={separator}
                        name="format.separator"
                        data={[
                            {
                                value: NumberSeparator.COMMA_PERIOD,
                                label: '100,000.00%',
                            },
                            {
                                value: NumberSeparator.SPACE_PERIOD,
                                label: '100 000.00%',
                            },
                            {
                                value: NumberSeparator.PERIOD_COMMA,
                                label: '100.000,00%',
                            },
                            {
                                value: NumberSeparator.NO_SEPARATOR_PERIOD,
                                label: '100000.00%',
                            },
                        ]}
                    />
                </Flex>
            )}
        </Box>
    );
};
const TableCalculationModal: FC<Props> = ({
    isOpen,
    isDisabled,
    tableCalculation,
    onSave,
    onClose,
}) => {
    const [isFullscreen, toggleFullscreen] = useToggle(false);
    const { showToastError } = useToaster();

    const tableCalculations = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.tableCalculations,
    );

    const { setAceEditor } = useExplorerAceEditorCompleter();
    const methods = useForm<TableCalculationFormInputs>({
        mode: 'onSubmit',
        defaultValues: {
            name: tableCalculation?.displayName,
            sql: tableCalculation?.sql,
            format: {
                type:
                    tableCalculation?.format?.type ||
                    TableCalculationFormatType.DEFAULT,
                round: tableCalculation?.format?.round,
                separator:
                    tableCalculation?.format?.separator ||
                    NumberSeparator.COMMA_PERIOD,
            },
        },
    });

    const tableCalculationName = methods.watch('name');
    return (
        <TableCalculationDialog
            isOpen={isOpen}
            onClose={() => (!isDisabled ? onClose() : undefined)}
            title={
                tableCalculation
                    ? 'Edit table calculation'
                    : 'Add table calculation'
            }
            lazy
            style={
                isFullscreen
                    ? {
                          position: 'absolute',
                          width: '100%',
                          height: '100%',
                      }
                    : undefined
            }
        >
            <FlexForm
                name="table_calculation"
                methods={methods}
                onSubmit={(data: TableCalculationFormInputs) => {
                    const { name, sql } = data;
                    try {
                        onSave({
                            name: getUniqueTableCalculationName(
                                name,
                                tableCalculations,
                            ),
                            displayName: name,
                            sql,
                            format: data.format,
                        });
                    } catch (e: any) {
                        showToastError({
                            title: 'Error saving',
                            subtitle: e.message,
                        });
                    }
                }}
            >
                <DialogBody className={Classes.DIALOG_BODY}>
                    <TextInput
                        mb="sm"
                        label="Name"
                        name="name"
                        disabled={isDisabled}
                        required
                        value={tableCalculationName}
                        onChange={(e) => {
                            methods.setValue('name', e.target.value);
                        }}
                    />
                    <Tabs defaultValue="sqlEditor">
                        <Tabs.List>
                            <Tabs.Tab value="sqlEditor">SQL</Tabs.Tab>
                            <Tabs.Tab value="format">Format</Tabs.Tab>
                        </Tabs.List>
                        <Tabs.Panel value="sqlEditor">
                            <TableCalculationSqlInputWrapper
                                $isFullScreen={isFullscreen}
                            >
                                <SqlInput
                                    name="sql"
                                    attributes={{
                                        readOnly: isDisabled,
                                        width: '100%',
                                        maxLines: isFullscreen ? 40 : 20,
                                        minLines: isFullscreen ? 40 : 8,
                                        editorProps: { $blockScrolling: true },
                                        enableBasicAutocompletion: true,
                                        enableLiveAutocompletion: true,
                                        onLoad: setAceEditor,
                                        wrapEnabled: true,
                                    }}
                                    placeholder={SQL_PLACEHOLDER}
                                />
                            </TableCalculationSqlInputWrapper>
                            <Callout intent="none" icon="clean">
                                <p>
                                    Need inspiration?{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.lightdash.com/guides/table-calculations/sql-templates"
                                        rel="noreferrer"
                                    >
                                        Check out our templates!
                                    </Anchor>
                                </p>
                            </Callout>
                        </Tabs.Panel>
                        <Tabs.Panel value="format">
                            <TableCalculationFormatForm methods={methods} />
                        </Tabs.Panel>
                    </Tabs>
                </DialogBody>
                <div className={Classes.DIALOG_FOOTER}>
                    <DialogButtons className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <FullScreenButton
                            icon={isFullscreen ? 'minimize' : 'fullscreen'}
                            onClick={toggleFullscreen}
                        ></FullScreenButton>
                        <Button onClick={onClose}>Cancel</Button>
                        <Button
                            type="submit"
                            intent={Intent.PRIMARY}
                            text="Save"
                            loading={isDisabled}
                        />
                    </DialogButtons>
                </div>
            </FlexForm>
        </TableCalculationDialog>
    );
};

export default TableCalculationModal;
