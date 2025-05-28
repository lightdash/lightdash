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
import intersectionBy from 'lodash/intersectionBy';
import { memo, useCallback, useMemo, type FC } from 'react';
import { useToggle } from 'react-use';
import MantineIcon from '../../../../common/MantineIcon';
import { ItemDetailMarkdown, ItemDetailPreview } from '../ItemDetailPreview';
import { useItemDetail } from '../useItemDetails';
import TreeNodes from './TreeNodes';
import { type GroupNode, type Node } from './types';
import useTableTree from './useTableTree';

const getAllChildrenKeys = (nodes: Node[]): string[] => {
    return nodes.flatMap(function loop(node): string[] {
        if (node.children) return Object.values(node.children).flatMap(loop);
        else return [node.key];
    });
};

type Props = {
    node: GroupNode;
};

const TreeGroupNodeComponent: FC<Props> = ({ node }) => {
    const selectedItems = useTableTree((ctx) => ctx.selectedItems);
    const isSearching = useTableTree((ctx) => ctx.isSearching);
    const searchQuery = useTableTree((ctx) => ctx.searchQuery);
    const searchResults = useTableTree((ctx) => ctx.searchResults);
    const [isOpen, toggleOpen] = useToggle(false);
    const [isHover, toggleHover] = useToggle(false);
    const { showItemDetail } = useItemDetail();

    const allChildrenKeys = useMemo(() => getAllChildrenKeys([node]), [node]);

    const hasSelectedChildren = useMemo(
        () => hasIntersection(allChildrenKeys, Array.from(selectedItems)),
        [allChildrenKeys, selectedItems],
    );

    const selectedChildrenCount = useMemo(
        () => intersectionBy(allChildrenKeys, Array.from(selectedItems)).length,
        [allChildrenKeys, selectedItems],
    );

    const hasVisibleChildren = useMemo(
        () =>
            !isSearching ||
            hasIntersection(allChildrenKeys, Array.from(searchResults)),
        [isSearching, allChildrenKeys, searchResults],
    );

    const forceOpen = isSearching && hasVisibleChildren;
    const isNavLinkOpen = forceOpen || isOpen;

    const { description, label } = node;

    /**
     * Handles putting together and opening the shared modal for a group's
     * detailed description.
     */
    const onOpenDescriptionView = useCallback(() => {
        toggleHover(false);

        showItemDetail({
            header: (
                <Group>
                    <Text size="md">{label}</Text>
                </Group>
            ),
            detail: description ? (
                <ItemDetailMarkdown source={description} />
            ) : (
                <Text color="gray">No description available.</Text>
            ),
        });
    }, [toggleHover, showItemDetail, label, description]);

    const handleToggleOpen = useCallback(() => toggleOpen(), [toggleOpen]);
    const handleMouseEnter = useCallback(
        () => toggleHover(true),
        [toggleHover],
    );
    const handleMouseLeave = useCallback(
        () => toggleHover(false),
        [toggleHover],
    );

    const handleDropdownClick = useCallback(
        /**
         * If we don't stop propagation, users may unintentionally toggle dimensions/metrics
         * while interacting with the hovercard.
         */
        (event: React.MouseEvent) => event.stopPropagation(),
        [],
    );

    const icon = useMemo(
        () => (
            <MantineIcon
                icon={IconChevronRight}
                size={14}
                style={{
                    margin: 1,
                    transition: 'transform 200ms ease',
                    transform: isNavLinkOpen ? 'rotate(90deg)' : undefined,
                }}
            />
        ),
        [isNavLinkOpen],
    );

    if (!hasVisibleChildren) return null;

    return (
        <NavLink
            opened={isNavLinkOpen}
            onClick={handleToggleOpen}
            // --start moves chevron to the left
            // mostly hardcoded, to match mantine's internal sizes
            disableRightSectionRotation
            rightSection={<></>}
            icon={icon}
            // --end moves chevron to the left
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
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
                        /**
                         * Ensures the hover card does not overlap with the right-hand menu.
                         */
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
                            /**
                             * Takes up space to the right, so it's OK to go fairly wide in the interest
                             * of readability.
                             */
                            maw={500}
                            onClick={handleDropdownClick}
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
            {isNavLinkOpen && <TreeNodes nodeMap={node.children} />}
        </NavLink>
    );
};

const TreeGroupNode = memo(TreeGroupNodeComponent);
TreeGroupNode.displayName = 'TreeGroupNode';

export default TreeGroupNode;
