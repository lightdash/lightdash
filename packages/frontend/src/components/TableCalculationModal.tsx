import React, { FC, useEffect, useState } from 'react';
import {
    Button,
    Classes,
    Dialog,
    FormGroup,
    InputGroup,
    Intent,
    TextArea,
} from '@blueprintjs/core';
import { snakeCaseName, TableCalculation } from 'common';
import { useApp } from '../providers/AppProvider';
import { useExplorer } from '../providers/ExplorerProvider';

interface Props {
    isOpen: boolean;
    isDisabled: boolean;
    tableCalculation?: TableCalculation;
    onSave: (tableCalculation: TableCalculation) => void;
    onClose: () => void;
}

const TableCalculationModal: FC<Props> = ({
    isOpen,
    isDisabled,
    tableCalculation,
    onSave,
    onClose,
}) => {
    const { showToastError } = useApp();
    const [name, setName] = useState<string>();
    const [sql, setSql] = useState<string>();

    useEffect(() => {
        if (tableCalculation) {
            setName(tableCalculation.displayName);
            setSql(tableCalculation.sql);
        }
    }, [tableCalculation]);

    const handleSave = () => {
        if (name && sql) {
            onSave({
                name: snakeCaseName(name),
                displayName: name,
                sql,
            });
        } else {
            showToastError({
                title: 'Required fields: name, sql',
                timeout: 3000,
            });
        }
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={() => (!isDisabled ? onClose() : undefined)}
            title="Save"
            lazy
            canOutsideClickClose
        >
            <div className={Classes.DIALOG_BODY}>
                <FormGroup
                    label="Name"
                    labelFor="name-input"
                    labelInfo="(required)"
                >
                    <InputGroup
                        id="name-input"
                        type="text"
                        required
                        disabled={isDisabled}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </FormGroup>
                <FormGroup
                    label="SQL"
                    labelFor="sql-input"
                    labelInfo="(required)"
                >
                    <TextArea
                        growVertically
                        large
                        fill
                        id="sql-input"
                        required
                        disabled={isDisabled}
                        value={sql}
                        onChange={(e) => setSql(e.target.value)}
                    />
                </FormGroup>
            </div>
            <div className={Classes.DIALOG_FOOTER}>
                <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button
                        intent={Intent.PRIMARY}
                        text="Save"
                        onClick={handleSave}
                        loading={isDisabled}
                    />
                </div>
            </div>
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

        const onCreate = (value: TableCalculation) => {
            addTableCalculation(value);
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

        const onUpdate = (value: TableCalculation) => {
            updateTableCalculation(tableCalculation.name, value);
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

        const onConfirm = () => {
            deleteTableCalculation(tableCalculation.name);
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
