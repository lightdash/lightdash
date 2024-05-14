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

    /**
     * Handles putting together and opening the shared modal for a groups
     * detailed description.
     */
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
                        /** Ensures the hover card does not overlap with the right-hand menu. */
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
                            /**
                             * If we don't stop propagation, users may unintentionally toggle dimensions/metrics
                             * while interacting with the hovercard.
                             */
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
