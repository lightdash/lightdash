import { getErrorMessage, type CatalogItem } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Popover,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import { IconCode, IconDots, IconTrash } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useDeleteTag, useUpdateTag } from '../hooks/useProjectTags';
import { TAG_COLOR_SWATCHES } from '../utils/getRandomTagColor';
import { CatalogCategory } from './CatalogCategory';
import { CatalogCategorySwatch } from './CatalogCategorySwatch';

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
                close();
            } catch (error) {
                console.error(`Tag update failed: ${getErrorMessage(error)}`);
            }
        }
    }, [editColor, editName, projectUuid, category, updateTag, close]);

    const onDelete = useCallback(async () => {
        if (category.tagUuid && projectUuid) {
            try {
                deleteTag({ projectUuid, tagUuid: category.tagUuid });
                close();
            } catch (error) {
                console.error(`Tag deletion failed: ${getErrorMessage(error)}`);
            }
        }
    }, [deleteTag, projectUuid, category, close]);

    return (
        <Popover
            position="top"
            opened={opened}
            closeOnClickOutside
            width={200}
            onClose={handleClose}
            trapFocus
        >
            <Popover.Target>
                <ActionIcon
                    sx={{
                        visibility: hovered || opened ? 'visible' : 'hidden',
                        '&:hover': {
                            backgroundColor: 'white',
                        },
                    }}
                    size="sm"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
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
                px="sm"
                onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                }}
            >
                <Stack spacing="xs">
                    <Text size="xs" weight={500} c="gray.6">
                        Edit category
                    </Text>
                    <TextInput
                        placeholder="Category name"
                        size="xs"
                        radius="md"
                        w="100%"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                    />

                    <SimpleGrid cols={7} spacing="xs" verticalSpacing="xs">
                        {TAG_COLOR_SWATCHES.map((color) => (
                            <CatalogCategorySwatch
                                key={color}
                                color={color}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEditColor(color);
                                }}
                                selected={editColor === color}
                            />
                        ))}
                    </SimpleGrid>

                    <Divider
                        c="gray.2"
                        sx={(theme) => ({
                            borderTopColor: theme.colors.gray[2],
                        })}
                    />

                    <Group position="apart">
                        <Tooltip
                            variant="xs"
                            label="Delete this tag permanently"
                        >
                            <ActionIcon
                                size="sm"
                                variant="outline"
                                color="gray.4"
                                onClick={onDelete}
                            >
                                <MantineIcon
                                    color="red"
                                    icon={IconTrash}
                                    size={14}
                                />
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
    canEdit: boolean;
};

export const MetricCatalogCategoryFormItem: FC<Props> = ({
    category,
    onClick,
    onSubPopoverChange,
    canEdit,
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
                borderRadius: theme.radius.md,
                '&:hover': {
                    backgroundColor: '#F8F9FA',
                    transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                },
            })}
        >
            <UnstyledButton onClick={onClick} h="100%" w="90%" pos="absolute" />
            <CatalogCategory category={category} onClick={onClick} />

            {canEdit && (
                <EditPopover
                    hovered={hovered}
                    category={category}
                    onOpenChange={onSubPopoverChange}
                />
            )}

            {!canEdit && (
                <Tooltip
                    variant="xs"
                    maw={200}
                    position="top"
                    withinPortal
                    label="This category was created in the .yml config and its properties cannot be edited"
                >
                    <Box
                        p="xxs"
                        sx={{
                            visibility: hovered ? 'visible' : 'hidden',
                        }}
                    >
                        <MantineIcon icon={IconCode} color="gray.6" size={14} />
                    </Box>
                </Tooltip>
            )}
        </Group>
    );
};
