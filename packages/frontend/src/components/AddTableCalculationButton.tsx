import { Button } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { memo, useState } from 'react';
import { MergeTableCalculationModal } from '../features/mergeQuery/components/MergeTableCalculationModal';
import { useMergeSafe } from '../features/mergeQuery/context/useMerge';
import { CreateTableCalculationModal } from '../features/tableCalculation';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import MantineIcon from './common/MantineIcon';

const AddTableCalculationButton = memo(() => {
    const [opened, setOpened] = useState<boolean>(false);
    const merge = useMergeSafe();
    const { track } = useTracking();
    return (
        <>
            <Button
                variant="default"
                size="xs"
                leftSection={<MantineIcon icon={IconPlus} />}
                component="button"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    setOpened(true);
                    track({
                        name: EventName.ADD_COLUMN_BUTTON_CLICKED,
                    });
                }}
                // Anchor for scope walkthroughs (data-tour-via)
                data-tour-anchor="add-table-calculation"
                data-tour-hint="Add a table calculation"
            >
                Table calculation
            </Button>

            {opened &&
                (merge?.isMerging ? (
                    <MergeTableCalculationModal
                        opened={opened}
                        onClose={() => setOpened(false)}
                    />
                ) : (
                    <CreateTableCalculationModal
                        opened={opened}
                        onClose={() => setOpened(false)}
                    />
                ))}
        </>
    );
});

export default AddTableCalculationButton;
