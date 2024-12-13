import { hasIntersection } from '@lightdash/common';
import {
    Badge,
    Group,
    Highlight,
    HoverCard,
    NavLink,
    Text,
} from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { intersectionBy } from 'lodash';
import { type FC } from 'react';
import { useToggle } from 'react-use';
import MantineIcon from '../../../../common/MantineIcon';
import { useItemDetail } from '../ItemDetailContext';
import { ItemDetailMarkdown, ItemDetailPreview } from '../ItemDetailPreview';
import TreeNodes from './TreeNodes';
import { useTableTreeContext, type GroupNode, type Node } from './TreeProvider';

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
    const [isHover, toggleHover] = useToggle(false);
    const { showItemDetail } = useItemDetail();
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
    const description = node.description;
    const label = node.label;

    const onOpenDescriptionView = () => {
        toggleHover(false);

        showItemDetail({
            header: (
                <Group>
                    <Text size="md">{label}</Text>
                </Group>
            ),
            detail: description ? (
                <ItemDetailMarkdown source={description}></ItemDetailMarkdown>
            ) : (
                <Text color="gray">No description available.</Text>
            ),
        });
    };

    return (
        <NavLink
            opened={isNavLinkOpen}
            onClick={toggleOpen}
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
            onMouseEnter={() => toggleHover(true)}
            onMouseLeave={() => toggleHover(false)}
            label={
                <Group>
                    {!isOpen && hasSelectedChildren && (
                        <Badge>{selectedChildrenCount}</Badge>
                    )}
                    <HoverCard
                        openDelay={300}
                        keepMounted={false}
                        shadow="sm"
                        withinPortal
                        withArrow
                        disabled={!description}
                        position="right"
                        offset={80}
                    >
                        <HoverCard.Target>
                            <Highlight
                                component={Text}
                                truncate
                                highlight={searchQuery || ''}
                            >
                                {label}
                            </Highlight>
                        </HoverCard.Target>
                        <HoverCard.Dropdown
                            hidden={!isHover}
                            p="xs"
                            maw={500}
                            onClick={(event) => event.stopPropagation()}
                        >
                            <ItemDetailPreview
                                onViewDescription={onOpenDescriptionView}
                                description={description}
                            />
                        </HoverCard.Dropdown>
                    </HoverCard>
                </Group>
            }
        >
            <TreeNodes nodeMap={node.children} />
        </NavLink>
    );
};

export default TreeGroupNode;
