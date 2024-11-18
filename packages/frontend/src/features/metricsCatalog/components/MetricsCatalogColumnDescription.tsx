import { type CatalogField } from '@lightdash/common';
import { Box, Highlight } from '@mantine/core';
import { type MRT_Row, type MRT_TableInstance } from 'mantine-react-table';
import { useRef, useState, type FC } from 'react';
import { useIsLineClamped } from '../../../hooks/useIsLineClamped';
import { MetricCatalogCellOverlay } from './MetricCatalogCellOverlay';

type Props = {
    row: MRT_Row<CatalogField>;
    table: MRT_TableInstance<CatalogField>;
};

export const MetricsCatalogColumnDescription: FC<Props> = ({ row, table }) => {
    const cellRef = useRef<HTMLDivElement>(null);
    const { ref: highlightRef, isLineClamped } =
        useIsLineClamped<HTMLDivElement>(2);
    const [isOpen, setIsOpen] = useState(false);
    const canOpen = isLineClamped && row.original.description;

    return (
        <Box ref={cellRef} p="sm">
            <Highlight
                ref={highlightRef}
                c={row.original.description ? 'dark.4' : 'dark.1'}
                fz="sm"
                fw={400}
                lh="150%"
                onClick={() => {
                    if (canOpen) {
                        setIsOpen(true);
                    }
                }}
                highlight={table.getState().globalFilter || ''}
                lineClamp={2}
                sx={{
                    cursor: canOpen ? 'pointer' : 'default',
                    color: row.original.description ? 'dark.4' : 'dark.1',
                }}
            >
                {row.original.description ?? '-'}
            </Highlight>

            <MetricCatalogCellOverlay
                isOpen={isOpen}
                setIsOpen={setIsOpen}
                content={row.original.description || ''}
                cellRef={cellRef}
                table={table}
            />
        </Box>
    );
};
