import { Button } from '@mantine-8/core';
import { IconPlus } from '@tabler/icons-react';
import { memo, useState } from 'react';
import { CreateTableCalculationModal } from '../features/tableCalculation';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import { COLLAPSIBLE_CARD_BUTTON_PROPS } from './common/CollapsibleCard/constants';
import MantineIcon from './common/MantineIcon';

const AddColumnButton = memo(() => {
    const [opened, setOpened] = useState<boolean>(false);
    const { track } = useTracking();
    return (
        <>
            <Button
                {...COLLAPSIBLE_CARD_BUTTON_PROPS}
                leftSection={<MantineIcon icon={IconPlus} />}
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
