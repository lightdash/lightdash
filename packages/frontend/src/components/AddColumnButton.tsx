import { Button } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { memo, useState } from 'react';
import { CreateTableCalculationModal } from '../features/tableCalculation';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from './common/CollapsableCard/constants';
import MantineIcon from './common/MantineIcon';

const AddColumnButton = memo(() => {
    const [opened, setOpened] = useState<boolean>(false);
    const { track } = useTracking();
    return (
        <>
            <Button
                {...COLLAPSABLE_CARD_BUTTON_PROPS}
                leftIcon={<MantineIcon icon={IconPlus} />}
                component="button"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    setOpened(true);
                    track({
                        name: EventName.ADD_COLUMN_BUTTON_CLICKED,
                    });
                }}
            >
                Table calculation
            </Button>

            {opened && (
                <CreateTableCalculationModal
                    opened={opened}
                    onClose={() => setOpened(false)}
                />
            )}
        </>
    );
});

export default AddColumnButton;
