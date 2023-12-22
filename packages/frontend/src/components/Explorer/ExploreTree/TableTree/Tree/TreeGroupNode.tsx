import { hasIntersection } from '@lightdash/common';
import { Badge, Group, Highlight, NavLink, Text } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import intersectionBy from 'lodash/intersectionBy';
import { FC } from 'react';
import { useToggle } from 'react-use';
import MantineIcon from '../../../../common/MantineIcon';
import TreeNodes from './TreeNodes';
import { GroupNode, Node, useTableTreeContext } from './TreeProvider';

const getAllChildrenKeys = (nodes: Node[]): string[] => {
    return nodes.flatMap(function loop(node): string[] {
        if (node.children) return Object.values(node.children).flatMap(loop);
        else return [node.key];
    });
};

type Props = {
    node: GroupNode;
};

const TreeGroupNode: FC<Props> = ({ node }) => {
    const { selectedItems, isSearching, searchQuery, searchResults } =
        useTableTreeContext();
    const [isOpen, toggleOpen] = useToggle(false);

    const allChildrenKeys: string[] = getAllChildrenKeys([node]);
    const hasSelectedChildren = hasIntersection(
        allChildrenKeys,
        Array.from(selectedItems),
    );
    const selectedChildrenCount = intersectionBy(
        allChildrenKeys,
        Array.from(selectedItems),
    ).length;
    const hasVisibleChildren =
        !isSearching ||
        hasIntersection(allChildrenKeys, Array.from(searchResults));
    const forceOpen = isSearching && hasVisibleChildren;

    if (!hasVisibleChildren) {
        return null;
    }

    const isNavLinkOpen = forceOpen || isOpen;

    return (
        <NavLink
            opened={isNavLinkOpen}
            onClick={toggleOpen}
            // --start moves chevron to the left
            // mostly hardcoded, to match mantine's internal sizes
            disableRightSectionRotation
            rightSection={<></>}
            icon={
                <MantineIcon
                    icon={IconChevronRight}
                    size={14}
                    style={{
                        margin: 1,
                        transition: 'transform 200ms ease',
                        transform: isNavLinkOpen ? 'rotate(90deg)' : undefined,
                    }}
                />
            }
            // --end
            label={
                <Group>
                    <Highlight
                        component={Text}
                        highlight={searchQuery || ''}
                        truncate
                    >
                        {node.label}
                    </Highlight>

                    {!isOpen && hasSelectedChildren && (
                        <Badge>{selectedChildrenCount}</Badge>
                    )}
                </Group>
            }
        >
            <TreeNodes nodeMap={node.children} />
        </NavLink>
    );
};

export default TreeGroupNode;
