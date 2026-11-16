import { ActionIcon, Menu, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconCode, IconMathFunction, IconPlus } from '@tabler/icons-react';
import { memo, useState } from 'react';
import { MergeTableCalculationModal } from '../features/mergeQuery/components/MergeTableCalculationModal';
import { useMergeSafe } from '../features/mergeQuery/context/useMerge';
import { CreateTableCalculationModal } from '../features/tableCalculation';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import classes from './AddTableCalculationButton.module.css';
import { COLLAPSABLE_CARD_ACTION_ICON_PROPS } from './common/CollapsableCard/constants';
import MantineIcon from './common/MantineIcon';

type Props = {
    /** Shown as a tooltip on the greyed-out button; the button works when absent. */
    disabledReason?: string;
    /** The + header cell at the results table's edge, not the header icon. */
    tableEdge?: boolean;
    /** Adds a custom dimension entry to the table-edge menu. */
    onAddCustomDimension?: () => void;
};

const AddTableCalculationButton = memo<Props>(
    ({ disabledReason, tableEdge = false, onAddCustomDimension }) => {
        const [opened, setOpened] = useState<boolean>(false);
        const merge = useMergeSafe();
        const { track } = useTracking();
        const handleClick = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (disabledReason) return;
            setOpened(true);
            track({ name: EventName.ADD_COLUMN_BUTTON_CLICKED });
        };
        return (
            <>
                {/* Two literal triggers: the tour generator reads anchors from source. */}
                {tableEdge ? (
                    <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                            <UnstyledButton
                                className={classes.edgeColumn}
                                aria-label="Add a column"
                            >
                                <MantineIcon icon={IconPlus} />
                            </UnstyledButton>
                        </Menu.Target>
                        <Menu.Dropdown maw={280}>
                            <Menu.Label>Add a column</Menu.Label>
                            <Menu.Item
                                leftSection={
                                    <MantineIcon icon={IconMathFunction} />
                                }
                                disabled={!!disabledReason}
                                onClick={handleClick}
                            >
                                Table calculation
                                <Text fz="xs" c="dimmed">
                                    {disabledReason ??
                                        'A formula on top of your results, like a running total'}
                                </Text>
                            </Menu.Item>
                            {onAddCustomDimension && (
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconCode} />
                                    }
                                    onClick={onAddCustomDimension}
                                >
                                    Custom dimension
                                    <Text fz="xs" c="dimmed">
                                        A new field from your raw data, written
                                        in SQL
                                    </Text>
                                </Menu.Item>
                            )}
                        </Menu.Dropdown>
                    </Menu>
                ) : (
                    <Tooltip label={disabledReason ?? 'Add table calculation'}>
                        <ActionIcon
                            {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
                            className={classes.headerButton}
                            aria-label="Table calculation"
                            // data-disabled keeps the tooltip working
                            data-disabled={disabledReason ? true : undefined}
                            onClick={handleClick}
                            // Anchor for scope walkthroughs (data-tour-via)
                            data-tour-anchor="add-table-calculation"
                            data-tour-hint="Add a table calculation"
                        >
                            <MantineIcon
                                icon={IconPlus}
                                size={12}
                                className={classes.plus}
                            />
                            <MantineIcon icon={IconMathFunction} />
                        </ActionIcon>
                    </Tooltip>
                )}

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
