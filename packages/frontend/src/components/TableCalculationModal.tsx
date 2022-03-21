import { Button, Callout, Classes, Dialog, Intent } from '@blueprintjs/core';
import { hasSpecialCharacters, snakeCaseName, TableCalculation } from 'common';
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { useExplore } from '../hooks/useExplore';
import { useExplorerAceEditorCompleter } from '../hooks/useExplorerAceEditorCompleter';
import { useApp } from '../providers/AppProvider';
import { useExplorer } from '../providers/ExplorerProvider';
import { useTracking } from '../providers/TrackingProvider';
import { EventName } from '../types/Events';
import Form from './ReactHookForm/Form';
import Input from './ReactHookForm/Input';
import SqlInput from './ReactHookForm/SqlInput';

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
    const { showToastError } = useApp();
    const {
        state: { dimensions, metrics, tableCalculations, tableName },
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
        <Dialog
            isOpen={isOpen}
            onClose={() => (!isDisabled ? onClose() : undefined)}
            title="Save"
            lazy
            canOutsideClickClose
        >
            <Form
                name="table_calculation"
                methods={methods}
                onSubmit={(data) => {
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
                <div className={Classes.DIALOG_BODY}>
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
                                            (fieldName, index) =>
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
                    <SqlInput
                        name="sql"
                        label="SQL"
                        attributes={{
                            readOnly: isDisabled,
                            height: '100px',
                            width: '100%',
                            editorProps: { $blockScrolling: true },
                            enableBasicAutocompletion: true,
                            enableLiveAutocompletion: true,
                            onLoad: setAceEditor,
                            wrapEnabled: true,
                        }}
                        placeholder={SQL_PLACEHOLDER}
                    />
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button onClick={onClose}>Cancel</Button>
                        <Button
                            type="submit"
                            intent={Intent.PRIMARY}
                            text="Save"
                            loading={isDisabled}
                        />
                    </div>
                </div>
            </Form>
        </Dialog>
    );
};

interface CreateTableCalculationModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const CreateTableCalculationModal: FC<CreateTableCalculationModalProps> =
    ({ isOpen, onClose }) => {
        const {
            actions: { addTableCalculation },
        } = useExplorer();
        const { track } = useTracking();
        const onCreate = (value: TableCalculation) => {
            addTableCalculation(value);
            track({
                name: EventName.CREATE_TABLE_CALCULATION_BUTTON_CLICKED,
            });
            onClose();
        };

        return (
            <TableCalculationModal
                isOpen={isOpen}
                isDisabled={false}
                onSave={onCreate}
                onClose={onClose}
            />
        );
    };

interface UpdateTableCalculationModalProps {
    isOpen: boolean;
    tableCalculation: TableCalculation;
    onClose: () => void;
}

export const UpdateTableCalculationModal: FC<UpdateTableCalculationModalProps> =
    ({ isOpen, tableCalculation, onClose }) => {
        const {
            actions: { updateTableCalculation },
        } = useExplorer();
        const { track } = useTracking();
        const onUpdate = (value: TableCalculation) => {
            updateTableCalculation(tableCalculation.name, value);
            track({
                name: EventName.UPDATE_TABLE_CALCULATION_BUTTON_CLICKED,
            });
            onClose();
        };

        return (
            <TableCalculationModal
                isOpen={isOpen}
                isDisabled={false}
                tableCalculation={tableCalculation}
                onSave={onUpdate}
                onClose={onClose}
            />
        );
    };

interface DeleteTableCalculationModalProps {
    isOpen: boolean;
    tableCalculation: TableCalculation;
    onClose: () => void;
}

export const DeleteTableCalculationModal: FC<DeleteTableCalculationModalProps> =
    ({ isOpen, tableCalculation, onClose }) => {
        const {
            actions: { deleteTableCalculation },
        } = useExplorer();
        const { track } = useTracking();

        const onConfirm = () => {
            deleteTableCalculation(tableCalculation.name);
            track({
                name: EventName.CONFIRM_DELETE_TABLE_CALCULATION_BUTTON_CLICKED,
            });
            onClose();
        };
        return (
            <Dialog
                isOpen={isOpen}
                icon="cog"
                onClose={onClose}
                title="Settings"
                lazy
                canOutsideClickClose={false}
            >
                <div className={Classes.DIALOG_BODY}>
                    <p>
                        Are you sure you want to delete this table calculation ?
                    </p>
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button onClick={onClose}>Cancel</Button>
                        <Button intent="danger" onClick={onConfirm}>
                            Delete
                        </Button>
                    </div>
                </div>
            </Dialog>
        );
    };

export default TableCalculationModal;
