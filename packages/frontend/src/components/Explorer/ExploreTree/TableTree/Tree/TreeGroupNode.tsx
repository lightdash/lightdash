import { Collapse, Colors, Text } from '@blueprintjs/core';
import { hasIntersection } from '@lightdash/common';
import { FC, useEffect } from 'react';
import { useToggle } from 'react-use';
import HighlightedText from '../../../../common/HighlightedText';
import { GroupNodeRow, Highlighted, RowIcon } from '../TableTree.styles';
import TreeNodes from './TreeNodes';
import { GroupNode, Node, useTableTreeContext } from './TreeProvider';

const getAllChildrenKeys = (nodes: Node[]): string[] => {
    return nodes.flatMap(function loop(node): string[] {
        if (node.children) return Object.values(node.children).flatMap(loop);
        else return [node.key];
    });
};

const TreeGroupNode: FC<{ node: GroupNode; depth: number }> = ({
    node,
    depth,
}) => {
    const { selectedItems, isSearching, searchQuery, searchResults } =
        useTableTreeContext();
    const [isOpen, toggle] = useToggle(false);
    const allChildrenKeys: string[] = getAllChildrenKeys([node]);
    const hasSelectedChildren = hasIntersection(
        allChildrenKeys,
        Array.from(selectedItems),
    );
    const hasVisibleChildren =
        !isSearching ||
        hasIntersection(allChildrenKeys, Array.from(searchResults));
    const forceOpen = isSearching && hasVisibleChildren;
    const isDisabled = hasSelectedChildren || forceOpen;

    useEffect(() => {
        if (hasSelectedChildren) {
            toggle(true);
        }
    }, [hasSelectedChildren, toggle]);

    if (!hasVisibleChildren) {
        return null;
    }

    return (
        <>
            <GroupNodeRow
                depth={depth}
                onClick={isDisabled ? undefined : toggle}
            >
                <RowIcon
                    icon={
                        isOpen || forceOpen ? 'chevron-down' : 'chevron-right'
                    }
                    size={16}
                    color={isDisabled ? Colors.LIGHT_GRAY1 : undefined}
                />
                <Text ellipsize>
                    <HighlightedText
                        text={node.label}
                        query={searchQuery || ''}
                        highlightElement={Highlighted}
                    />
                </Text>
            </GroupNodeRow>
            <Collapse isOpen={isOpen || forceOpen}>
                <TreeNodes nodeMap={node.children} depth={depth + 1} />
            </Collapse>
        </>
    );
};

export default TreeGroupNode;
