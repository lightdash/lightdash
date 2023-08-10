import { Button } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { FC, memo, useState } from 'react';
import { useTracking } from '../providers/TrackingProvider';
import { EventName } from '../types/Events';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from './common/CollapsableCard';
import MantineIcon from './common/MantineIcon';
import { CreateTableCalculationModal } from './TableCalculationModals';

const AddColumnButton: FC = memo(() => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const { track } = useTracking();
    return (
        <>
            <Button
                {...COLLAPSABLE_CARD_BUTTON_PROPS}
                leftIcon={<MantineIcon icon={IconPlus} />}
                component="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(true);
                    track({
                        name: EventName.ADD_COLUMN_BUTTON_CLICKED,
                    });
                }}
            >
                Table calculation
            </Button>

            {isOpen && (
                <CreateTableCalculationModal
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                />
            )}
        </>
    );
});

export default AddColumnButton;
