import { type FC, type ReactNode } from 'react';
import layout from '../homepageLayout.module.css';

type PageGridProps = {
    // Page columns one item spans, from the resolver. null falls back to a
    // single full-width column.
    itemSpan: number | null;
    children: ReactNode;
};

/**
 * The homepage's shared 12-column card grid. Every card-grid block renders
 * through this so card edges land on the same tracks regardless of block type,
 * and a remainder row starts on the same track as a full one.
 */
export const PageGrid: FC<PageGridProps> = ({ itemSpan, children }) => (
    <div className={layout.pageGrid} data-span={itemSpan ?? 12}>
        {children}
    </div>
);

export const PageGridItem: FC<{ children: ReactNode }> = ({ children }) => (
    <div className={layout.pageGridItem}>{children}</div>
);
