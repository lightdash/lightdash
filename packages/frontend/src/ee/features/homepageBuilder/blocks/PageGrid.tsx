import { Box } from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';
import layout from '../homepageLayout.module.css';

type PageGridProps = {
    // Page columns one item spans, from the resolver. null falls back to a
    // single full-width column.
    itemSpan: number | null;
    // Elastic grids stretch to fill their column, distributing height across
    // their rows — a short block beside a taller sibling closes the gap
    // bento-style instead of leaving dead space. Only for blocks whose cards
    // tolerate growing; rigid cards (resources) define height.
    elastic?: boolean;
    // Row floor for elastic grids: 'half' for half-unit tiles, 'unit' for
    // full-unit cards. Containment stops content sizing the rows, so the
    // floor is what holds an unstretched grid at its natural height.
    floor?: 'half' | 'unit';
    children: ReactNode;
};

/**
 * The homepage's shared 12-column card grid. Every card-grid block renders
 * through this so card edges land on the same tracks regardless of block type,
 * and a remainder row starts on the same track as a full one.
 */
export const PageGrid: FC<PageGridProps> = ({
    itemSpan,
    elastic = false,
    floor = 'half',
    children,
}) => (
    <Box
        className={layout.pageGrid}
        data-span={itemSpan ?? 12}
        data-elastic={elastic || undefined}
        data-floor={elastic ? floor : undefined}
    >
        {children}
    </Box>
);

export const PageGridItem: FC<{ children: ReactNode }> = ({ children }) => (
    <Box className={layout.pageGridItem}>{children}</Box>
);
