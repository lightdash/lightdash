import { Button, Callout, Classes, Intent } from '@blueprintjs/core';
import {
    NumberSeparators,
    snakeCaseName,
    TableCalculation,
    TableCalculationFormat,
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
import Input from '../ReactHookForm/Input';

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
    const formatType = methods.watch('format.type', 'default');
    const round = methods.watch('format.round');
    const separator = methods.watch('format.separator');

    //TODO this component is using Mantine components with a react-hook-form,
    //once we use mantine form we should refactor this to remove onChange methods

    const previewPercentSeparator = () => {
        if ((round === undefined ? 2 : round) <= 0) return '';
        switch (separator) {
            case NumberSeparators.PERIOD_COMMA:
                return ',';
            default:
                return '.';
        }
    };
    const previewRound = () => {
        if ((round === undefined ? 2 : round) <= 0) return '';
        return '0123456789'.slice(0, round || 2);
    };
    const previewFormat = () => {
        switch (formatType) {
            case 'percent':
                return `Looks like: 23${previewPercentSeparator()}${previewRound()}%`;
            default:
                return '';
        }
    };
    return (
        <Box m="md">
            <Flex>
                <Select
                    w={200}
                    onChange={(type) => {
                        methods.setValue('format.type', type || 'default');
                    }}
                    label="Type"
                    name="format.type"
                    defaultValue={'default'}
                    data={['default', 'percent']}
                />

                <Text ml="md" mt={30} color="gray.6">
                    {previewFormat()}
                </Text>
            </Flex>
            {formatType === 'percent' && (
                <Flex>
                    <TextInput
                        w={200}
                        label="Round"
                        name="format.round"
                        placeholder="Number of decimal places"
                        onChange={(r) => {
                            //TODO check type

                            methods.setValue(
                                'format.round',
                                r.target.value === ''
                                    ? undefined
                                    : parseInt(r.target.value),
                            );
                        }}
                    />
                    <Select
                        ml="md"
                        onChange={(s) => {
                            if (s)
                                methods.setValue(
                                    'format.separator',
                                    s as NumberSeparators,
                                );
                        }}
                        label="Type"
                        name="format.separator"
                        defaultValue={'comma-dot'}
                        data={[
                            {
                                value: NumberSeparators.COMMA_PERIOD,
                                label: '100,000.00',
                            },
                            {
                                value: NumberSeparators.SPACE_PERIOD,
                                label: '100 000.00',
                            },
                            {
                                value: NumberSeparators.PERIOD_COMMA,
                                label: '100.000,00',
                            },
                            {
                                value: NumberSeparators.NO_SEPARATOR_PERIOD,
                                label: '100000.00',
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

    const dimensions = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.dimensions,
    );
    const metrics = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.metrics,
    );
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
                type: 'default',
                round: 2,
                separator: NumberSeparators.COMMA_PERIOD,
            },
        },
    });

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
                    const { name } = data;
                    try {
                        onSave({
                            ...data,
                            name: getUniqueTableCalculationName(
                                name,
                                tableCalculations,
                            ),
                            displayName: name,
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
                    <Input
                        label="Name"
                        name="name"
                        disabled={isDisabled}
                        rules={{
                            required: true,
                            validate: {
                                unique_column_name: (columnName) =>
                                    !dimensions
                                        .concat(metrics)
                                        .concat(
                                            tableCalculations
                                                .filter(
                                                    ({ name }) =>
                                                        !tableCalculation ||
                                                        name !==
                                                            tableCalculation.name,
                                                )
                                                .map(
                                                    ({ displayName }) =>
                                                        displayName,
                                                ),
                                        )
                                        .some(
                                            (fieldName) =>
                                                fieldName ===
                                                snakeCaseName(columnName),
                                        ) ||
                                    'Column with same name already exists',
                            },
                        }}
                    />
                    <Tabs defaultValue="sql">
                        <Tabs.List>
                            <Tabs.Tab value="sql">SQL</Tabs.Tab>
                            <Tabs.Tab value="format">Format</Tabs.Tab>
                        </Tabs.List>
                        <Tabs.Panel value="sql">
                            {' '}
                            <TableCalculationSqlInputWrapper
                                $isFullScreen={isFullscreen}
                            >
                                <SqlInput
                                    name="sql"
                                    attributes={{
                                        readOnly: isDisabled,
                                        height: '100%',
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
                        </Tabs.Panel>
                        <Tabs.Panel value="format">
                            <TableCalculationFormatForm methods={methods} />
                        </Tabs.Panel>
                    </Tabs>
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
