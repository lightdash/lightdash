import { type CatalogItem } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Stack,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
    useMantineTheme,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconDots, IconRefresh, IconTrash } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useDeleteTag, useUpdateTag } from '../hooks/useProjectTags';
import { getRandomColor } from '../utils/getRandomTagColor';
import { CatalogCategory } from './CatalogCategory';

type Props = {
    category: CatalogItem['categories'][number];
    onClick?: () => void;
};

export const MetricCatalogCategoryFormItem: FC<Props> = ({
    category,
    onClick,
}) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const { mutate: updateTag } = useUpdateTag();
    const { mutate: deleteTag } = useDeleteTag();
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(category.name);
    const [editColor, setEditColor] = useState(category.color);
    const { colors } = useMantineTheme();
    const { ref: hoverRef, hovered } = useHover<HTMLDivElement>();

    const handleSave = useCallback(async () => {
        if (category.tagUuid && projectUuid) {
            try {
                updateTag({
                    projectUuid,
                    tagUuid: category.tagUuid,
                    data: { name: editName, color: editColor },
                });
                setIsEditing(false);
            } catch (error) {
                console.error('Tag update failed:', error);
            }
        }
    }, [editColor, editName, projectUuid, category, updateTag]);

    const onDelete = useCallback(async () => {
        if (category.tagUuid && projectUuid) {
            try {
                deleteTag({ projectUuid, tagUuid: category.tagUuid });
            } catch (error) {
                console.error('Tag deletion failed:', error);
            }
        }
    }, [deleteTag, projectUuid, category]);

    if (isEditing) {
        return (
            <Stack spacing="xs" w="100%">
                <Group position="apart" noWrap>
                    <Group noWrap spacing="xs">
                        <Tooltip
                            label={
                                <Stack p="two" spacing="xs">
                                    <Text fw={600}>Change color</Text>
                                    <CatalogCategory
                                        category={{
                                            color: editColor,
                                            name: editName,
                                        }}
                                    />
                                </Stack>
                            }
                            variant="xs"
                        >
                            <ActionIcon
                                size="xs"
                                onClick={() =>
                                    setEditColor(getRandomColor(colors))
                                }
                                sx={(theme) => ({
                                    borderRadius: '90%',
                                    backgroundColor: editColor,
                                    '&:hover': {
                                        backgroundColor: theme.fn.darken(
                                            editColor,
                                            0.1,
                                        ),
                                    },
                                })}
                            >
                                <MantineIcon
                                    icon={IconRefresh}
                                    color="gray.0"
                                    size={14}
                                />
                            </ActionIcon>
                        </Tooltip>

                        <TextInput
                            size="xs"
                            radius="md"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                        />
                    </Group>
                    <Group spacing={4} noWrap>
                        <Tooltip
                            variant="xs"
                            label="Delete this tag permanently"
                        >
                            <ActionIcon
                                size="xs"
                                variant="subtle"
                                color="red"
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
                </Group>
            </Stack>
        );
    }

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
            ></UnstyledButton>
            <CatalogCategory category={category} />
            {hovered && (
                <ActionIcon
                    size="xs"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsEditing(true);
                    }}
                >
                    <MantineIcon icon={IconDots} color="gray.6" size={14} />
                </ActionIcon>
            )}
        </Group>
    );
};
