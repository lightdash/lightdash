import { Button, Tooltip } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { memo, useState } from 'react';
import { MergeTableCalculationModal } from '../features/mergeQuery/components/MergeTableCalculationModal';
import { useMergeSafe } from '../features/mergeQuery/context/useMerge';
import { CreateTableCalculationModal } from '../features/tableCalculation';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import MantineIcon from './common/MantineIcon';

type Props = {
    /** Shown as a tooltip on the greyed-out button; the button works when absent. */
    disabledReason?: string;
};

const AddTableCalculationButton = memo<Props>(({ disabledReason }) => {
    const [opened, setOpened] = useState<boolean>(false);
    const merge = useMergeSafe();
    const { track } = useTracking();
    return (
        <>
            <Tooltip label={disabledReason} disabled={!disabledReason}>
                <Button
                    variant="default"
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    component="button"
                    // data-disabled keeps the tooltip working
                    data-disabled={disabledReason ? true : undefined}
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                        e.stopPropagation();
                        if (disabledReason) {
                            return;
                        }
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
            </Tooltip>

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
