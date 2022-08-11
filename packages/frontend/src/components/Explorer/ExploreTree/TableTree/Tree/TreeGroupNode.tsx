import { Collapse, Colors, Icon, Text } from '@blueprintjs/core';
import { hasIntersection } from '@lightdash/common';
import React, { FC, useEffect } from 'react';
import { useToggle } from 'react-use';
import HighlightedText from '../../../../common/HighlightedText';
import { Hightlighed, Row } from '../TableTree.styles';
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
            <Row
                depth={depth}
                onClick={isDisabled ? undefined : toggle}
                style={{
                    fontWeight: 600,
                }}
            >
                <Icon
                    icon={
                        isOpen || forceOpen ? 'chevron-down' : 'chevron-right'
                    }
                    size={16}
                    style={{ marginRight: 8 }}
                    color={isDisabled ? Colors.LIGHT_GRAY1 : undefined}
                />
                <Text ellipsize>
                    <HighlightedText
                        text={node.label}
                        query={searchQuery || ''}
                        highlightElement={Hightlighed}
                    />
                </Text>
            </Row>
            <Collapse isOpen={isOpen || forceOpen}>
                {/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
                <TreeNodes nodeMap={node.children} depth={depth + 1} />
            </Collapse>
        </>
    );
};

export default TreeGroupNode;
