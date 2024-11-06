import { type CatalogField } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Checkbox,
    Group,
    Popover,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useListState } from '@mantine/hooks';
import { IconSearch, IconTag, IconX } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { useProjectTags } from '../hooks/useCatalogTags';
import { clearTagFilters, setTagFilters } from '../store/metricsCatalogSlice';
import { CatalogTag } from './CatalogTag';

type Props = {
    search: string | undefined;
    setSearch: (search: string) => void;
};

const TagsFilter = () => {
    const dispatch = useAppDispatch();
    // Tracks selected tags while the popover is open - when the user closes the popover, the selected tags are set in the redux store,
    // which triggers a new search
    const [selectedTags, selectedTagsHandlers] = useListState<
        CatalogField['catalogTags'][number]['tagUuid']
    >([]);
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const { data: tags, isLoading } = useProjectTags(projectUuid);

    const hasSelectedTags = selectedTags.length > 0;

    return (
        <Group spacing="two">
            <Popover
                width={300}
                onClose={() => dispatch(setTagFilters(selectedTags))}
                position="bottom-start"
            >
                <Popover.Target>
                    <Button
                        size="xs"
                        color="gray.5"
                        c="gray.6"
                        variant="default"
                        radius="md"
                        leftIcon={<MantineIcon icon={IconTag} color="gray.6" />}
                        loading={isLoading}
                        sx={(theme) => ({
                            border: `1px dashed ${theme.colors.gray[4]}`,
                            backgroundColor: theme.fn.lighten(
                                theme.colors.gray[0],
                                0.3,
                            ),
                        })}
                    >
                        {hasSelectedTags
                            ? `${selectedTags.length} tags`
                            : 'All tags'}
                    </Button>
                </Popover.Target>
                <Popover.Dropdown>
                    <Stack spacing="sm">
                        <Group position="apart">
                            <Text weight={500}>Filter by tags</Text>
                        </Group>
                        {tags?.map((tag) => (
                            <Checkbox
                                key={tag.tagUuid}
                                label={<CatalogTag tag={tag} />}
                                checked={selectedTags.includes(tag.tagUuid)}
                                onChange={() => {
                                    if (selectedTags.includes(tag.tagUuid)) {
                                        selectedTagsHandlers.filter(
                                            (t) => t !== tag.tagUuid,
                                        );
                                    } else {
                                        selectedTagsHandlers.append(
                                            tag.tagUuid,
                                        );
                                    }
                                }}
                            />
                        ))}
                    </Stack>
                </Popover.Dropdown>
            </Popover>
            {hasSelectedTags && (
                <Tooltip variant="xs" label="Clear all tags">
                    <ActionIcon
                        size="xs"
                        color="gray.5"
                        onClick={() => {
                            selectedTagsHandlers.setState([]);
                            dispatch(clearTagFilters());
                        }}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
};

export const MetricsTableTopToolbar: FC<Props> = memo(
    ({ search, setSearch }) => (
        <Group p="sm" spacing="xs">
            {/* Search input */}
            <TextInput
                size="xs"
                radius="md"
                w={300}
                type="search"
                variant="default"
                placeholder="Search by metric name or description"
                value={search}
                icon={<MantineIcon icon={IconSearch} />}
                onChange={(e) => setSearch(e.target.value)}
            />
            {/* Tags filter */}
            <TagsFilter />
        </Group>
    ),
);
