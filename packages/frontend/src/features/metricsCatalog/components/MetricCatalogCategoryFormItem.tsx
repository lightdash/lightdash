import { type CatalogItem } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    HoverCard,
    Stack,
    TextInput,
    useMantineTheme,
} from '@mantine/core';
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
    const { mutateAsync: updateTag } = useUpdateTag();
    const { mutateAsync: deleteTag } = useDeleteTag();
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(category.name);
    const [editColor, setEditColor] = useState(category.color);
    const { colors } = useMantineTheme();

    const handleSave = useCallback(async () => {
        if (category.tagUuid && projectUuid) {
            await updateTag({
                projectUuid,
                tagUuid: category.tagUuid,
                data: { name: editName, color: editColor },
            });
        }
        setIsEditing(false);
    }, [editColor, editName, projectUuid, category.tagUuid, updateTag]);

    const onDelete = useCallback(async () => {
        if (category.tagUuid && projectUuid) {
            await deleteTag({ projectUuid, tagUuid: category.tagUuid });
        }
    }, [deleteTag, projectUuid, category.tagUuid]);

    if (isEditing) {
        return (
            <Stack spacing="xs" w="100%">
                <Group position="apart" noWrap>
                    <Group noWrap spacing="xs">
                        <HoverCard>
                            <HoverCard.Target>
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
                            </HoverCard.Target>
                            <HoverCard.Dropdown>
                                <CatalogCategory
                                    category={{
                                        color: editColor,
                                        name: editName,
                                    }}
                                />
                            </HoverCard.Dropdown>
                        </HoverCard>

                        <TextInput
                            size="xs"
                            radius="md"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                        />
                    </Group>
                    <Group spacing={4} noWrap>
                        <ActionIcon
                            size="xs"
                            variant="subtle"
                            color="gray.6"
                            onClick={onDelete}
                        >
                            <MantineIcon icon={IconTrash} size={14} />
                        </ActionIcon>

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
        <Group spacing={4} position="apart" w="100%">
            <CatalogCategory category={category} onClick={onClick} />
            <ActionIcon
                size="xs"
                variant="subtle"
                onClick={() => setIsEditing(true)}
            >
                <MantineIcon icon={IconDots} color="gray.6" size={14} />
            </ActionIcon>
        </Group>
    );
};
