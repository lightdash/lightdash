import { Button, Callout, Classes, Intent } from '@blueprintjs/core';
import {
    Compact,
    CompactConfigMap,
    currencies,
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
        NumberSeparator.DEFAULT,
    );
    const currency = methods.watch('format.currency');
    const compact = methods.watch('format.compact');
    const prefix = methods.watch('format.prefix');
    const suffix = methods.watch('format.suffix');

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
                        TableCalculationFormatType.CURRENCY,
                        TableCalculationFormatType.NUMBER,
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
                            TableCalculationFormatType.PERCENT === formatType
                                ? '0.75'
                                : '1234.56',
                        )}
                    </Text>
                )}
            </Flex>

            {formatType !== TableCalculationFormatType.DEFAULT && (
                <Flex mt="md">
                    {formatType === TableCalculationFormatType.CURRENCY && (
                        <Select
                            mr="md"
                            w={200}
                            searchable
                            onChange={(s) => {
                                if (s)
                                    methods.setValue(
                                        'format.currency',
                                        s as NumberSeparator,
                                    );
                            }}
                            label="Currency"
                            value={currency}
                            name="format.currency"
                            data={currencies.map((c) => {
                                const currencyFormat = Intl.NumberFormat(
                                    undefined,
                                    { style: 'currency', currency: c },
                                );

                                return {
                                    value: c,
                                    label: `${c} (${currencyFormat
                                        .format(1234.56)
                                        .replace(/\u00A0/, ' ')})`,
                                };
                            })}
                        />
                    )}
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
                        w={200}
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
                                value: NumberSeparator.DEFAULT,
                                label: 'Default separator',
                            },
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
            {(formatType === TableCalculationFormatType.CURRENCY ||
                formatType === TableCalculationFormatType.NUMBER) && (
                <Flex mt="md">
                    <Select
                        mr="md"
                        w={200}
                        onChange={(s) => {
                            methods.setValue(
                                'format.compact',
                                s === 'None' ? undefined : (s as Compact),
                            );
                        }}
                        label="Compact"
                        value={compact || 'None'}
                        name="format.compact"
                        data={[
                            'None',
                            ...Object.values(Compact).map((c) => {
                                return {
                                    value: c,
                                    label: CompactConfigMap[c].label,
                                };
                            }),
                        ]}
                    />

                    {formatType === TableCalculationFormatType.NUMBER && (
                        <>
                            <TextInput
                                w={200}
                                mr="md"
                                label="Prefix"
                                name="format.prefix"
                                placeholder="E.g. GBP revenue:"
                                value={prefix}
                                onChange={(r) => {
                                    methods.setValue(
                                        'format.prefix',
                                        r.target.value,
                                    );
                                }}
                            />
                            <TextInput
                                w={200}
                                label="Suffix"
                                name="format.suffix"
                                placeholder="E.g. km/h"
                                value={suffix}
                                onChange={(r) => {
                                    methods.setValue(
                                        'format.suffix',
                                        r.target.value,
                                    );
                                }}
                            />
                        </>
                    )}
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
                    NumberSeparator.DEFAULT,
                currency: tableCalculation?.format?.currency || 'USD',
                compact: tableCalculation?.format?.compact,
                prefix: tableCalculation?.format?.prefix,
                suffix: tableCalculation?.format?.suffix,
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
                                <Text>
                                    Need inspiration?{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.lightdash.com/guides/table-calculations/sql-templates"
                                        rel="noreferrer"
                                    >
                                        Check out our templates!
                                    </Anchor>
                                </Text>
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
