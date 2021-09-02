import React, { FC, useState } from 'react';
import { Tooltip2 } from '@blueprintjs/popover2';
import { Button } from '@blueprintjs/core';
import { CreateTableCalculationModal } from './TableCalculationModal';

const AddColumnButton: FC = () => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    return (
        <div style={{ display: 'inline-flex', gap: '10px' }}>
            <Tooltip2 content="Add table calculation">
                <Button
                    minimal
                    icon="small-plus"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(true);
                    }}
                    style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: 0,
                    }}
                />
            </Tooltip2>
            {isOpen && (
                <CreateTableCalculationModal
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                />
            )}
        </div>
    );
};

export default AddColumnButton;
