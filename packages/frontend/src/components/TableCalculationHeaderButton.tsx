import React, { FC, useState } from 'react';
import { TableCalculation } from 'common';
import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import {
    Button,
    Icon,
    Menu,
    MenuItem,
    PopoverPosition,
} from '@blueprintjs/core';
import {
    DeleteTableCalculationModal,
    UpdateTableCalculationModal,
} from './TableCalculationModal';

const TableCalculationHeaderButton: FC<{
    tableCalculation: TableCalculation;
}> = ({ tableCalculation }) => {
    const [showUpdate, setShowUpdate] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [isOpen, setIsOpen] = useState<boolean>();

    return (
        <div style={{ float: 'right' }}>
            <Popover2
                isOpen={isOpen === undefined ? false : isOpen}
                onInteraction={setIsOpen}
                content={
                    <Menu>
                        <MenuItem
                            icon={<Icon icon="edit" />}
                            text="Edit"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowUpdate(true);
                                setIsOpen(false);
                            }}
                        />
                        <MenuItem
                            icon={<Icon icon="delete" />}
                            text="Delete"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowDelete(true);
                                setIsOpen(false);
                            }}
                        />
                    </Menu>
                }
                position={PopoverPosition.BOTTOM_LEFT}
                lazy
            >
                <Tooltip2 content="View options">
                    <Button
                        minimal
                        small
                        icon="cog"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsOpen((value) => !value);
                        }}
                        style={{
                            minHeight: 'auto',
                            minWidth: 'auto',
                        }}
                    />
                </Tooltip2>
            </Popover2>
            {showUpdate && (
                <UpdateTableCalculationModal
                    isOpen
                    tableCalculation={tableCalculation}
                    onClose={() => setShowUpdate(false)}
                />
            )}
            {showDelete && (
                <DeleteTableCalculationModal
                    isOpen
                    tableCalculation={tableCalculation}
                    onClose={() => setShowDelete(false)}
                />
            )}
        </div>
    );
};

export default TableCalculationHeaderButton;
