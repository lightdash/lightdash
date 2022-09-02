import React, { FC, memo, useState } from 'react';
import { useTracking } from '../providers/TrackingProvider';
import { EventName } from '../types/Events';
import SimpleButton from './common/SimpleButton';
import { CreateTableCalculationModal } from './TableCalculationModels';

const AddColumnButton: FC = memo(() => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const { track } = useTracking();
    return (
        <div style={{ display: 'inline-flex', gap: '10px' }}>
            <SimpleButton
                icon="plus"
                text="Table calculation"
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(true);
                    track({
                        name: EventName.ADD_COLUMN_BUTTON_CLICKED,
                    });
                }}
            />
            {isOpen && (
                <CreateTableCalculationModal
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                />
            )}
        </div>
    );
});

export default AddColumnButton;
