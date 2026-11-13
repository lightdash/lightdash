import { NavLink, Text } from '@mantine/core';
import { IconArrowsJoin, IconTable } from '@tabler/icons-react';
import { memo, useCallback, useMemo, type FC } from 'react';
import { useToggle } from 'react-use';
import MantineIcon from '../../../../common/MantineIcon';
import { TableItemDetailPreview } from '../ItemDetailPreview';
import type { TableHeaderItem } from './types';
import classes from './VirtualTableHeader.module.css';

interface VirtualTableHeaderProps {
    item: TableHeaderItem;
    isJoined: boolean;
    onToggle: () => void;
}

/**
 * Renders a table header in the virtualized tree
 */
const VirtualTableHeaderComponent: FC<VirtualTableHeaderProps> = ({
    item,
    isJoined,
    onToggle,
}) => {
    const { table, isExpanded } = item.data;
    const [isHover, toggleHover] = useToggle(false);

    const tableMetadata = useMemo(
        () => ({
            name: table.name,
            dbtPackageName: table.dbtPackageName,
            ymlPath: table.ymlPath,
            sqlPath: table.sqlPath,
        }),
        [table.name, table.dbtPackageName, table.ymlPath, table.sqlPath],
    );

    const handleMouseEnter = useCallback(
        () => toggleHover(true),
        [toggleHover],
    );
    const handleMouseLeave = useCallback(
        () => toggleHover(false),
        [toggleHover],
    );
    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLElement>) => {
            if (event.nativeEvent.code === 'Space') {
                event.preventDefault();
                onToggle();
            }
        },
        [onToggle],
    );

    const label = (
        <TableItemDetailPreview
            label={table.label}
            description={table.description}
            showPreview={isHover}
            closePreview={handleMouseLeave}
            tableMetadata={tableMetadata}
        >
            <Text truncate fz="sm" fw={600}>
                {table.label}
            </Text>
        </TableItemDetailPreview>
    );

    return (
        <NavLink
            component="button"
            opened={isExpanded}
            onClick={onToggle}
            onKeyDown={handleKeyDown}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            label={label}
            leftSection={
                <MantineIcon
                    icon={isJoined ? IconArrowsJoin : IconTable}
                    size={16}
                    color="ldGray.6"
                />
            }
            className={classes.stickyHeader}
        >
            {[]}
        </NavLink>
    );
};

const VirtualTableHeader = memo(VirtualTableHeaderComponent);
VirtualTableHeader.displayName = 'VirtualTableHeader';

export default VirtualTableHeader;
