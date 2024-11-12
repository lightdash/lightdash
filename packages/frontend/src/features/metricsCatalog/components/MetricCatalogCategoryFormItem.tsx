import { type CatalogItem } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Popover,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
    useMantineTheme,
} from '@mantine/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import { IconDots, IconTrash } from '@tabler/icons-react';
import { useCallback, useRef, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useDeleteTag, useUpdateTag } from '../hooks/useProjectTags';
import { getTagColorSwatches } from '../utils/getRandomTagColor';
import { CatalogCategory } from './CatalogCategory';

type EditPopoverProps = {
    hovered: boolean;
    category: CatalogItem['categories'][number];
    onOpenChange?: (isOpen: boolean) => void;
};

const EditPopover: FC<EditPopoverProps> = ({
    hovered,
    category,
    onOpenChange,
}) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const { mutate: updateTag } = useUpdateTag();
    const { mutate: deleteTag } = useDeleteTag();
    const [opened, { open, close }] = useDisclosure(false);
    const [editName, setEditName] = useState(category.name);
    const [editColor, setEditColor] = useState(category.color);
    const colors = getTagColorSwatches(useMantineTheme().colors);
    const popoverRef = useRef<HTMLDivElement>(null);

    const handleClose = useCallback(() => {
        close();
        onOpenChange?.(false);
    }, [close, onOpenChange]);

    const handleSave = useCallback(async () => {
        if (category.tagUuid && projectUuid) {
            try {
                updateTag({
                    projectUuid,
                    tagUuid: category.tagUuid,
                    data: { name: editName, color: editColor },
                });
                handleClose();
            } catch (error) {
                console.error('Tag update failed:', error);
            }
        }
    }, [editColor, editName, projectUuid, category, updateTag, handleClose]);

    const onDelete = useCallback(async () => {
        if (category.tagUuid && projectUuid) {
            try {
                deleteTag({ projectUuid, tagUuid: category.tagUuid });
            } catch (error) {
                console.error('Tag deletion failed:', error);
            }
        }
    }, [deleteTag, projectUuid, category]);

    return (
        <Popover
            position="top"
            shadow="lg"
            opened={opened}
            trapFocus
            radius="md"
            closeOnClickOutside={true}
            width={200}
            onClose={handleClose}
            withinPortal
        >
            <Popover.Target>
                <ActionIcon
                    sx={{
                        visibility: hovered || opened ? 'visible' : 'hidden',
                    }}
                    size="xs"
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        open();
                        onOpenChange?.(true);
                    }}
                >
                    <MantineIcon icon={IconDots} color="gray.6" size={14} />
                </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown
                onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                }}
            >
                <Stack spacing="xs" ref={popoverRef}>
                    <Stack w="100%" spacing="two">
                        <Text size="xs" weight={500} c="gray.7">
                            Name
                        </Text>
                        <TextInput
                            size="xs"
                            radius="md"
                            w="100%"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                        />
                    </Stack>

                    <Stack spacing="two">
                        <Text size="xs" weight={500} c="gray.7">
                            Colors
                        </Text>
                        <Group spacing="xs">
                            <SimpleGrid cols={8} spacing="xs">
                                {colors.map((color) => (
                                    <Box
                                        key={color}
                                        w={14}
                                        h={14}
                                        bg={color}
                                        sx={(theme) => ({
                                            cursor: 'pointer',
                                            borderRadius: '2px',
                                            border:
                                                editColor === color
                                                    ? '1px solid black'
                                                    : 'none',
                                            '&:hover': {
                                                backgroundColor:
                                                    theme.fn.darken(color, 0.3),
                                            },
                                        })}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditColor(color);
                                        }}
                                    />
                                ))}
                            </SimpleGrid>
                        </Group>
                    </Stack>

                    <Group position="right" mt="xs">
                        <Tooltip
                            variant="xs"
                            label="Delete this tag permanently"
                        >
                            <ActionIcon
                                size="sm"
                                variant="outline"
                                color="gray"
                                onClick={onDelete}
                            >
                                <MantineIcon icon={IconTrash} size={14} />
                            </ActionIcon>
                        </Tooltip>

                        <Button
                            color="gray.9"
                            size="xs"
                            compact
                            onClick={handleSave}
                        >
                            Save
                        </Button>
                    </Group>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

type Props = {
    category: CatalogItem['categories'][number];
    onClick?: () => void;
    onSubPopoverChange?: (isOpen: boolean) => void;
};

export const MetricCatalogCategoryFormItem: FC<Props> = ({
    category,
    onClick,
    onSubPopoverChange,
}) => {
    const { ref: hoverRef, hovered } = useHover<HTMLDivElement>();

    return (
        <Group
            ref={hoverRef}
            px={4}
            py={3}
            pos="relative"
            position="apart"
            sx={(theme) => ({
                borderRadius: theme.radius.sm,
                '&:hover': { backgroundColor: theme.colors.gray[2] },
            })}
        >
            <UnstyledButton
                onClick={onClick}
                w="100%"
                h="100%"
                pos="absolute"
            />
            <CatalogCategory category={category} />
            <EditPopover
                hovered={hovered}
                category={category}
                onOpenChange={onSubPopoverChange}
            />
        </Group>
    );
};
