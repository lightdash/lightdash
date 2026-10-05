import { VisuallyHidden } from '@mantine/core';
import {
    IconAdjustmentsHorizontal,
    IconFilter,
    IconGripVertical,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './dashboardControls.module.css';

type Props = {
    // Null for a new control whose kind is not chosen yet: the slot is empty
    kind: 'filter' | 'parameter' | null;
    // A pill that can be dragged shows its grip here on hover or focus
    isDraggable: boolean;
};

// The slot at the start of every control pill: what kind of control it is.
// Its width never changes, so no pill does.
const ControlKindSlot: FC<Props> = ({ kind, isDraggable }) => (
    <span
        className={classes.kindSlot}
        data-draggable={isDraggable || undefined}
    >
        {kind !== null && (
            <MantineIcon
                className={classes.kindIcon}
                icon={
                    kind === 'filter' ? IconFilter : IconAdjustmentsHorizontal
                }
                size="sm"
                color="dimmed"
            />
        )}
        {isDraggable && (
            <MantineIcon
                className={classes.kindGrip}
                icon={IconGripVertical}
                cursor="grab"
                size="sm"
            />
        )}
        {/* The icon is for the eye; the pill's name carries the kind */}
        {kind !== null && (
            <VisuallyHidden>
                {kind === 'filter' ? 'Filter, ' : 'Parameter, '}
            </VisuallyHidden>
        )}
    </span>
);

export default ControlKindSlot;
