import { memo, type FC } from 'react';
import type { FlattenedItem, SectionContext } from './types';
import VirtualEmptyState from './VirtualEmptyState';
import VirtualMissingField from './VirtualMissingField';
import VirtualSectionHeader from './VirtualSectionHeader';
import VirtualTableHeader from './VirtualTableHeader';
import VirtualTreeNode from './VirtualTreeNode';

interface VirtualTreeItemProps {
    item: FlattenedItem;
    sectionContexts: Map<string, SectionContext>;
}

/**
 * Router component that renders the appropriate sub-component
 * based on the flattened item type
 */
const VirtualTreeItemComponent: FC<VirtualTreeItemProps> = ({
    item,
    sectionContexts,
}) => {
    switch (item.type) {
        case 'table-header':
            return <VirtualTableHeader item={item} />;
        case 'section-header':
            return <VirtualSectionHeader item={item} />;
        case 'missing-field':
            return <VirtualMissingField item={item} />;
        case 'tree-node':
            return (
                <VirtualTreeNode
                    item={item}
                    sectionContexts={sectionContexts}
                />
            );
        case 'empty-state':
            return <VirtualEmptyState item={item} />;
        default:
            return null;
    }
};

const VirtualTreeItem = memo(VirtualTreeItemComponent);
VirtualTreeItem.displayName = 'VirtualTreeItem';

export default VirtualTreeItem;
