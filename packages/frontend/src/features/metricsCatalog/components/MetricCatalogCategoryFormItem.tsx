import {
    getErrorMessage,
    interpolateUiString,
    type CatalogItem,
} from '@lightdash/common';
import {
    TextInput,
    Box,
    Divider,
    Group,
    Stack,
    Text,
    UnstyledButton,
    Button,
    ActionIcon,
    SimpleGrid,
    Popover,
    Tooltip,
    CloseButton,
} from '@mantine/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import { IconCode, IconDots, IconTrash } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useDeleteTag, useUpdateTag } from '../hooks/useProjectTags';
import { TAG_COLOR_SWATCHES } from '../utils/getRandomTagColor';
import { CatalogCategory } from './CatalogCategory';
import { CatalogCategorySwatch } from './CatalogCategorySwatch';
import styles from './MetricCatalogCategoryFormItem.module.css';

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
    const getUiString = useUiStrings();
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
                handleClose();
            } catch (error) {
                console.error(`Tag update failed: ${getErrorMessage(error)}`);
            }
        }
    }, [editColor, editName, projectUuid, category, updateTag, handleClose]);

    const onDelete = useCallback(async () => {
        if (category.tagUuid && projectUuid) {
            try {
                deleteTag({ projectUuid, tagUuid: category.tagUuid });
                handleClose();
            } catch (error) {
                console.error(`Tag deletion failed: ${getErrorMessage(error)}`);
            }
        }
    }, [deleteTag, projectUuid, category, handleClose]);

    return (
        <Popover
            position="top"
            opened={opened}
            closeOnClickOutside
            width="min(300px, calc(100vw - 24px))"
            floatingStrategy="fixed"
            middlewares={{ shift: { crossAxis: true, padding: 12 } }}
            // Controlled v8 Popovers signal outside-click/Escape via onDismiss, not onClose
            onDismiss={handleClose}
            onClose={handleClose}
            trapFocus={opened}
        >
            <Popover.Target>
                <ActionIcon
                    className={styles.editButton}
                    data-visible={hovered || opened || undefined}
                    aria-label={interpolateUiString(
                        getUiString('metrics.editCategory'),
                        { category: category.name },
                    )}
                    size="sm"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                        e.stopPropagation();
                        e.preventDefault();
                        open();
                        onOpenChange?.(true);
                    }}
                >
                    <MantineIcon icon={IconDots} color="dimmed" size={14} />
                </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown
                px="sm"
                className={styles.editDropdown}
                onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                }}
            >
                <Stack gap="xs">
                    <Group
                        justify="space-between"
                        className={styles.editorHeader}
                    >
                        <Text size="xs" fw={500} c="dimmed">
                            Edit category
                        </Text>
                        <CloseButton
                            size={44}
                            aria-label={getUiString(
                                'metrics.closeCategoryEditor',
                            )}
                            onClick={handleClose}
                        />
                    </Group>
                    <TextInput
                        placeholder="Category name"
                        aria-label={getUiString('metrics.categoryName')}
                        size="xs"
                        w="100%"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                    />

                    <SimpleGrid
                        cols={7}
                        spacing="xs"
                        verticalSpacing="xs"
                        className={styles.colorGrid}
                    >
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

                    <Divider color="ldGray.2" />

                    <Group justify="space-between">
                        <Tooltip
                            label="Delete this tag permanently"
                            openDelay={200}
                            maw={250}
                            fz="xs"
                        >
                            <ActionIcon
                                aria-label={interpolateUiString(
                                    getUiString('metrics.deleteCategory'),
                                    { category: category.name },
                                )}
                                size="sm"
                                variant="outline"
                                color="ldGray.4"
                                onClick={onDelete}
                            >
                                <MantineIcon
                                    color="red"
                                    icon={IconTrash}
                                    size={14}
                                />
                            </ActionIcon>
                        </Tooltip>

                        <Button size="compact-xs" onClick={handleSave}>
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
            justify="space-between"
            className={styles.categoryFormItem}
        >
            <UnstyledButton
                onClick={onClick}
                disabled={!onClick}
                className={styles.categoryButton}
                // Walkthrough action for manage:Tags: every category in the
                // open form carries it; the first one is the pick. See
                // scripts/scope-tours.
                data-tour-scope="manage:Tags"
                data-tour-step="2"
                data-tour-route="/projects/:projectUuid/metrics"
                data-tour-label="Choose a category"
                data-tour-title="Put a metric in a category"
                data-tour-interactive="true"
                data-tour-via='[data-tour-nav="metrics"] >> [data-tour-anchor="metric-categories"][data-tour-value="Total revenue"]'
                data-tour-docs="explore/metrics-catalog/curate-the-catalog.mdx#browsing-the-catalog:li3:3"
            >
                <CatalogCategory category={category} />
            </UnstyledButton>

            {canEdit && (
                <EditPopover
                    hovered={hovered}
                    category={category}
                    onOpenChange={onSubPopoverChange}
                />
            )}

            {!canEdit && (
                <Tooltip
                    maw={200}
                    position="top"
                    openDelay={200}
                    fz="xs"
                    label="This category was created in the .yml config and its properties cannot be edited"
                >
                    <Box
                        p="xxs"
                        style={{
                            visibility: hovered ? 'visible' : 'hidden',
                        }}
                    >
                        <MantineIcon icon={IconCode} color="dimmed" size={14} />
                    </Box>
                </Tooltip>
            )}
        </Group>
    );
};
