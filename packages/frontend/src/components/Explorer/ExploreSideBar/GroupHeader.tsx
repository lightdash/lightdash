import { Box, Group, NavLink, Text } from '@mantine/core';
import { useToggle } from '@mantine/hooks';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { TableItemDetailPreview } from '../ExploreTree/TableTree/ItemDetailPreview';

const INDENT_PER_DEPTH = 16;

type GroupHeaderProps = {
    label: string;
    description?: string;
    isExpanded: boolean;
    onToggle: () => void;
    depth?: number;
};

const GroupHeader: FC<GroupHeaderProps> = ({
    label,
    description,
    isExpanded,
    onToggle,
    depth = 0,
}) => {
    const [isHover, toggleHover] = useToggle();
    const hasDescription = !!description;

    return (
        <Box style={{ paddingLeft: `${depth * INDENT_PER_DEPTH}px` }}>
            <NavLink
                opened={isExpanded}
                onClick={onToggle}
                onMouseEnter={
                    hasDescription ? () => toggleHover(true) : undefined
                }
                onMouseLeave={
                    hasDescription ? () => toggleHover(false) : undefined
                }
                // --start moves chevron to the left
                // mostly hardcoded, to match mantine's internal sizes
                disableRightSectionRotation
                rightSection={<></>}
                leftSection={
                    <MantineIcon
                        icon={isExpanded ? IconChevronDown : IconChevronRight}
                        size={14}
                        style={{
                            margin: 1,
                        }}
                    />
                }
                // --end
                label={
                    <TableItemDetailPreview
                        label={label}
                        description={description}
                        showPreview={hasDescription && isHover}
                        closePreview={() => toggleHover(false)}
                        offset={0}
                    >
                        <Group>
                            <Text fz="sm" fw={500} c="ldGray.7">
                                {label}
                            </Text>
                        </Group>
                    </TableItemDetailPreview>
                }
            />
        </Box>
    );
};

export default GroupHeader;
