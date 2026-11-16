import { ActionIcon, Tooltip } from '@mantine/core';
import { IconMathFunction, IconPlus } from '@tabler/icons-react';
import { memo, useState } from 'react';
import { MergeTableCalculationModal } from '../features/mergeQuery/components/MergeTableCalculationModal';
import { useMergeSafe } from '../features/mergeQuery/context/useMerge';
import { CreateTableCalculationModal } from '../features/tableCalculation';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import { COLLAPSABLE_CARD_ACTION_ICON_PROPS } from './common/CollapsableCard/constants';
import MantineIcon from './common/MantineIcon';

type Props = {
    /** Shown as a tooltip on the greyed-out button; the button works when absent. */
    disabledReason?: string;
    /** The floating + at the results table's edge, not the header icon. */
    tableEdge?: boolean;
};

const AddTableCalculationButton = memo<Props>(
    ({ disabledReason, tableEdge = false }) => {
        const [opened, setOpened] = useState<boolean>(false);
        const merge = useMergeSafe();
        const { track } = useTracking();
        const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            if (disabledReason) return;
            setOpened(true);
            track({ name: EventName.ADD_COLUMN_BUTTON_CLICKED });
        };
        return (
            <>
                <Tooltip label={disabledReason ?? 'Add table calculation'}>
                    {/* Two literal triggers: the tour generator reads anchors from source. */}
                    {tableEdge ? (
                        <ActionIcon
                            variant="default"
                            size="sm"
                            radius="xl"
                            aria-label="Add table calculation"
                            data-disabled={disabledReason ? true : undefined}
                            onClick={handleClick}
                        >
                            <MantineIcon icon={IconPlus} />
                        </ActionIcon>
                    ) : (
                        <ActionIcon
                            {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
                            aria-label="Table calculation"
                            // data-disabled keeps the tooltip working
                            data-disabled={disabledReason ? true : undefined}
                            onClick={handleClick}
                            // Anchor for scope walkthroughs (data-tour-via)
                            data-tour-anchor="add-table-calculation"
                            data-tour-hint="Add a table calculation"
                        >
                            <MantineIcon icon={IconMathFunction} />
                        </ActionIcon>
                    )}
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
    },
);

export default AddTableCalculationButton;
