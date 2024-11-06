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
import { useDeleteTag, useUpdateTag } from '../hooks/useCatalogTags';
import { getRandomColor } from '../utils/getRandomTagColor';
import { CatalogTag } from './CatalogTag';

type Props = {
    tag: CatalogItem['catalogTags'][number];
    onTagClick?: () => void;
};

export const MetricCatalogTagFormItem: FC<Props> = ({ tag, onTagClick }) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const { mutateAsync: updateTag } = useUpdateTag();
    const { mutateAsync: deleteTag } = useDeleteTag();
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(tag.name);
    const [editColor, setEditColor] = useState(tag.color);
    const { colors } = useMantineTheme();

    const handleSave = useCallback(async () => {
        if (tag.tagUuid && projectUuid) {
            await updateTag({
                projectUuid,
                tagUuid: tag.tagUuid,
                data: { name: editName, color: editColor },
            });
        }
        setIsEditing(false);
    }, [editColor, editName, projectUuid, tag.tagUuid, updateTag]);

    const onDelete = useCallback(async () => {
        if (tag.tagUuid && projectUuid) {
            await deleteTag({ projectUuid, tagUuid: tag.tagUuid });
        }
    }, [deleteTag, projectUuid, tag.tagUuid]);

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
                                <CatalogTag
                                    tag={{
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
            <CatalogTag tag={tag} onTagClick={onTagClick} />
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
