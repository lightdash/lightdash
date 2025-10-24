import { NavLink, Text } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { memo, useCallback, type FC } from 'react';
import { useToggle } from 'react-use';
import MantineIcon from '../../../../common/MantineIcon';
import { TableItemDetailPreview } from '../ItemDetailPreview';
import type { TableHeaderItem } from './types';

interface VirtualTableHeaderProps {
    item: TableHeaderItem;
    onToggle: () => void;
}

/**
 * Renders a table header in the virtualized tree
 */
const VirtualTableHeaderComponent: FC<VirtualTableHeaderProps> = ({
    item,
    onToggle,
}) => {
    const { table, isExpanded } = item.data;
    const [isHover, toggleHover] = useToggle(false);

    const handleMouseEnter = useCallback(
        () => toggleHover(true),
        [toggleHover],
    );
    const handleMouseLeave = useCallback(
        () => toggleHover(false),
        [toggleHover],
    );
    const handleClosePreview = useCallback(
        () => toggleHover(false),
        [toggleHover],
    );

    const label = (
        <TableItemDetailPreview
            label={table.label}
            description={table.description}
            showPreview={isHover}
            closePreview={handleClosePreview}
        >
            <Text truncate fw={600}>
                {table.label}
            </Text>
        </TableItemDetailPreview>
    );

    return (
        <NavLink
            opened={isExpanded}
            onClick={onToggle}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            icon={<MantineIcon icon={IconTable} size="lg" color="gray.7" />}
            label={label}
            style={{
                top: 0,
                position: 'sticky',
                backgroundColor: 'white',
                zIndex: 1,
            }}
        >
            {/* Hack to render the icons from NavLink */}
            {[]}
        </NavLink>
    );
};

const VirtualTableHeader = memo(VirtualTableHeaderComponent);
VirtualTableHeader.displayName = 'VirtualTableHeader';

export default VirtualTableHeader;
