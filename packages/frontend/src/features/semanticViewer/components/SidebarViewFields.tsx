import {
    assertUnreachable,
    FieldType as FieldKind,
    type SemanticLayerField,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    Highlight,
    Loader,
    NavLink,
    Stack,
    TextInput,
} from '@mantine/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { useMemo, useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useSemanticLayerViewFields } from '../api/hooks';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { toggleField } from '../store/semanticViewerSlice';
import FieldIcon from './FieldIcon';

const getNavbarColorByFieldKind = (kind: SemanticLayerField['kind']) => {
    switch (kind) {
        case FieldKind.DIMENSION:
            return 'blue';
        case FieldKind.METRIC:
            return 'orange';
        default:
            return assertUnreachable(kind, `Unknown field kind ${kind}`);
    }
};

const getSearchResults = (
    fields: SemanticLayerField[],
    searchQuery: string,
) => {
    if (searchQuery === '') return fields;

    return new Fuse(fields, {
        keys: ['label', 'name', 'description'],
        ignoreLocation: true,
        threshold: 0.3,
    })
        .search(searchQuery)
        .map((result) => result.item);
};

const SidebarViewFields = () => {
    const {
        projectUuid,
        view,
        selectedDimensions,
        selectedTimeDimensions,
        selectedMetrics,
    } = useAppSelector((state) => state.semanticViewer);
    const dispatch = useAppDispatch();

    const [searchQuery, setSearchQuery] = useState('');

    if (!view) {
        throw new Error('Impossible state');
    }

    const fields = useSemanticLayerViewFields({ projectUuid, view });

    const searchedFields = useMemo(() => {
        if (!fields.data) return;

        return getSearchResults(fields.data, searchQuery);
    }, [fields.data, searchQuery]);

    if (fields.isError) {
        throw fields.error;
    }

    if (fields.isLoading) {
        return (
            <Center sx={{ flexGrow: 1 }}>
                <Loader color="gray" size="sm" />
            </Center>
        );
    }

    const handleFieldToggle = (
        field: Pick<SemanticLayerField, 'name' | 'kind' | 'type'>,
    ) => {
        dispatch(toggleField(field));
    };

    const searchedOrAllFields = searchedFields ?? fields.data;

    return fields.data.length === 0 ? (
        <SuboptimalState
            title="No fields available"
            description="No fields have been created in this view yet."
        />
    ) : (
        <Stack spacing="md" sx={{ flexGrow: 1 }}>
            <Box sx={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <TextInput
                    size="xs"
                    type="search"
                    icon={<MantineIcon icon={IconSearch} />}
                    rightSection={
                        searchQuery ? (
                            <ActionIcon
                                size="xs"
                                onClick={() => setSearchQuery('')}
                            >
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        ) : null
                    }
                    placeholder="Search fields"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </Box>

            {searchedFields && searchedOrAllFields.length === 0 ? (
                <SuboptimalState
                    title="No fields match search"
                    description="No fields match the search query."
                />
            ) : (
                <Stack spacing="one">
                    {searchedOrAllFields.map((field) => (
                        <NavLink
                            key={field.name}
                            h="xxl"
                            color={getNavbarColorByFieldKind(field.kind)}
                            label={
                                <Highlight
                                    highlight={searchQuery.split(' ')}
                                    truncate
                                >
                                    {field.label}
                                </Highlight>
                            }
                            icon={<FieldIcon field={field} />}
                            disabled={!field.visible}
                            active={
                                // FIXME: not the best way to check if a field is selected
                                selectedDimensions.includes(field.name) ||
                                selectedTimeDimensions.includes(field.name) ||
                                selectedMetrics.includes(field.name)
                            }
                            onClick={() => handleFieldToggle(field)}
                        />
                    ))}
                </Stack>
            )}
        </Stack>
    );
};

export default SidebarViewFields;
