import { ActionIcon, Group, Tooltip } from '@mantine-8/core';
import { NavLink, Text, useMantineTheme } from '@mantine/core';
import { IconInfoCircle, IconTable } from '@tabler/icons-react';
import { memo, useCallback, useMemo, type FC } from 'react';
import { useToggle } from 'react-use';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../../../../features/explorer/store';
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
    const theme = useMantineTheme();
    const dispatch = useExplorerDispatch();
    const { table, isExpanded } = item.data;
    const [isHover, toggleHover] = useToggle(false);
    const showMetadataIcon = Boolean(
        table.dbtPackageName || table.ymlPath || table.sqlPath,
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

    const openMetadataModal = useCallback(() => {
        toggleHover(false);
        dispatch(
            explorerActions.openItemDetail({
                itemType: 'table',
                label: table.label,
                description: table.description,
                tableMetadata,
            }),
        );
    }, [toggleHover, dispatch, table.label, table.description, tableMetadata]);

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
                {showMetadataIcon && (
                    <Tooltip label="View dbt model details" withinPortal>
                        <ActionIcon
                            variant="subtle"
                            size="sm"
                            color="gray"
                            aria-label="View dbt model details"
                            onClick={(e) => {
                                e.stopPropagation();
                                openMetadataModal();
                            }}
                        >
                            <MantineIcon icon={IconInfoCircle} />
                        </ActionIcon>
                    </Tooltip>
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
            icon={<MantineIcon icon={IconTable} size="lg" color="ldGray.7" />}
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
