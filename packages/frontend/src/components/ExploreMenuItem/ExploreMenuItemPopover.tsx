import { PopoverInteractionKind, Position } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { SummaryExplore } from '@lightdash/common';
import { FC } from 'react';
import TableInfo from './TableInfo';

interface ExploreMenuItemPopoverProps {
    explore: SummaryExplore;
}

const PopoverContent: FC<ExploreMenuItemPopoverProps> = ({ explore }) => {
    return (
        <div onClick={(e) => e.stopPropagation()}>
            <TableInfo
                name={explore.name}
                schemaName={explore.schemaName}
                databaseName={explore.databaseName}
                description={explore.description}
            />
        </div>
    );
};

const ExploreMenuItemPopover: FC<ExploreMenuItemPopoverProps> = ({
    explore,
    children,
}) => {
    return (
        <Popover2
            lazy
            position={Position.RIGHT_TOP}
            interactionKind={PopoverInteractionKind.HOVER}
            content={<PopoverContent explore={explore} />}
        >
            {children}
        </Popover2>
    );
};

export default ExploreMenuItemPopover;
