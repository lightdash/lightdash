import { Group } from '@mantine-8/core';
import { NavLink, Text, useMantineTheme } from '@mantine/core';
import { memo, useCallback, useMemo, type FC } from 'react';
import { useToggle } from 'react-use';
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
    const theme = useMantineTheme();
    const { table, isExpanded } = item.data;
    const [isHover, toggleHover] = useToggle(false);

    // Matches what the tree renders: hidden fields are excluded
    const fieldCount = useMemo(
        () =>
            Object.values(table.dimensions).filter((d) => !d.hidden).length +
            Object.values(table.metrics).filter((m) => !m.hidden).length,
        [table.dimensions, table.metrics],
    );

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

    const stickyStyle = useMemo(
        () => ({
            top: 0,
            position: 'sticky' as const,
            backgroundColor:
                theme.colorScheme === 'dark'
                    ? theme.colors.dark[7]
                    : theme.colors.background[0],
            zIndex: 1,
        }),
        [theme.colorScheme, theme.colors],
    );

    const label = (
        <TableItemDetailPreview
            label={table.label}
            description={table.description}
            showPreview={isHover}
            closePreview={handleMouseLeave}
            tableMetadata={tableMetadata}
        >
            <Group gap="xs" wrap="nowrap">
                <Text truncate fw={600}>
                    {table.label}
                </Text>
                {!isExpanded && (
                    <Text size="xs" color="ldGray.6" fw={400}>
                        {fieldCount} {fieldCount === 1 ? 'field' : 'fields'}
                    </Text>
                )}
            </Group>
        </TableItemDetailPreview>
    );

    return (
        <NavLink
            opened={isExpanded}
            onClick={onToggle}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            label={label}
            style={stickyStyle}
        >
            {[]}
        </NavLink>
    );
};

const VirtualTableHeader = memo(VirtualTableHeaderComponent);
VirtualTableHeader.displayName = 'VirtualTableHeader';

export default VirtualTableHeader;
