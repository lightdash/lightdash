import { Button, Callout, Classes, Intent, Switch } from '@blueprintjs/core';
import { hasSpecialCharacters, snakeCaseName, TableCalculation } from 'common';
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { useToggle } from 'react-use';
import { useExplore } from '../../hooks/useExplore';
import { useExplorerAceEditorCompleter } from '../../hooks/useExplorerAceEditorCompleter';
import { useApp } from '../../providers/AppProvider';
import { useExplorer } from '../../providers/ExplorerProvider';
import Input from '../ReactHookForm/Input';
import SqlInput from '../ReactHookForm/SqlInput';
import {
    DialogBody,
    DialogButtons,
    FlexForm,
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
};

const TableCalculationModal: FC<Props> = ({
    isOpen,
    isDisabled,
    tableCalculation,
    onSave,
    onClose,
}) => {
    const [isFullscreen, toggleFullscreen] = useToggle(false);
    const { showToastError } = useApp();
    const {
        state: {
            unsavedChartVersion: {
                tableName,
                metricQuery: { dimensions, metrics, tableCalculations },
            },
        },
    } = useExplorer();
    const { setAceEditor } = useExplorerAceEditorCompleter();
    const { data: { targetDatabase } = {} } = useExplore(tableName);
    const methods = useForm<TableCalculationFormInputs>({
        mode: 'onSubmit',
        defaultValues: {
            name: tableCalculation?.displayName,
            sql: tableCalculation?.sql,
        },
    });

    return (
        <TableCalculationDialog
            isOpen={isOpen}
            onClose={() => (!isDisabled ? onClose() : undefined)}
            title="Save"
            lazy
            canOutsideClickClose
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
                onClick={(e: any) => {
                    e.stopPropagation();
                }}
                onSubmit={(data: TableCalculationFormInputs) => {
                    const { name, sql } = data;
                    try {
                        onSave({
                            name: snakeCaseName(name),
                            displayName: name,
                            sql,
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
                                special_character: (columnName) =>
                                    !hasSpecialCharacters(columnName) ||
                                    'Please remove any special characters from the column name',
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
                    {(targetDatabase === 'postgres' ||
                        targetDatabase === 'redshift') && (
                        <Callout
                            intent="none"
                            icon="info-sign"
                            style={{ marginTop: 20, marginBottom: 20 }}
                        >
                            <p>
                                {' '}
                                Since you&apos;re using {targetDatabase},
                                dividing and taking the average of two integers
                                won&apos;t return decimals.
                                <div style={{ marginTop: '5px' }}>
                                    If you want to see all the digits, you have
                                    to cast one of your integers as a decimal:{' '}
                                    <span style={{ color: 'grey' }}>
                                        $&#123;table_name.field_name&#125;::decimal/$&#123;table_name.field_name&#125;
                                    </span>
                                </div>
                            </p>
                        </Callout>
                    )}
                    <TableCalculationSqlInputWrapper>
                        <SqlInput
                            name="sql"
                            label="SQL"
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
                </DialogBody>
                <div className={Classes.DIALOG_FOOTER}>
                    <DialogButtons className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Switch
                            checked={isFullscreen}
                            label="Fullscreen"
                            onChange={toggleFullscreen}
                        />
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
