import {
    assertUnreachable,
    FieldType as FieldKind,
    type SemanticLayerField,
    type SemanticLayerTimeDimension,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    Loader,
    LoadingOverlay,
    Paper,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useSemanticLayerViewFields } from '../api/hooks';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    selectAllSelectedFieldNames,
    selectAllSelectedFieldsByKind,
} from '../store/selectors';
import {
    toggleDimension,
    toggleMetric,
    toggleTimeDimension,
} from '../store/semanticViewerSlice';
import SidebarViewFieldItem from './SidebarViewFieldItem';

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

type SidebarViewFieldsGroupProps = {
    fields: SemanticLayerField[];
    allSelectedFields: string[];
    searchQuery: string;
    handleFieldToggle: (field: SemanticLayerField) => void;
};

const SidebarViewFieldsGroup: FC<SidebarViewFieldsGroupProps> = ({
    fields,
    allSelectedFields,
    searchQuery,
    handleFieldToggle,
}) => {
    return (
        <Box>
            <Text transform="uppercase" fz="xs">
                Selected fields ({allSelectedFields.length})
            </Text>

            <Paper
                display="flex"
                radius="md"
                sx={{
                    flexDirection: 'column',
                    overflow: 'hidden',
                    gap: 1,
                }}
            >
                {fields.map((field) => (
                    <SidebarViewFieldItem
                        key={field.name}
                        field={field}
                        searchQuery={searchQuery}
                        isActive={true}
                        onFieldToggle={() => handleFieldToggle(field)}
                    />
                ))}
            </Paper>
        </Box>
    );
};

const SidebarViewFields = () => {
    const { projectUuid, view } = useAppSelector(
        (state) => state.semanticViewer,
    );
    const allSelectedFieldsBykind = useAppSelector(
        selectAllSelectedFieldsByKind,
    );
    const allSelectedFieldNames = useAppSelector(selectAllSelectedFieldNames);
    const dispatch = useAppDispatch();

    const [searchQuery, setSearchQuery] = useState('');

    if (!view) {
        throw new Error('Impossible state');
    }

    const fields = useSemanticLayerViewFields(
        {
            projectUuid,
            view,
            selectedFields: allSelectedFieldsBykind,
        },
        {
            keepPreviousData: true,
        },
    );

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
        field:
            | Pick<SemanticLayerField, 'name' | 'kind'>
            | Pick<SemanticLayerTimeDimension, 'name' | 'kind' | 'granularity'>,
    ) => {
        if ('granularity' in field) {
            return dispatch(toggleTimeDimension(field));
        }

        switch (field.kind) {
            case FieldKind.DIMENSION:
                return dispatch(toggleDimension(field));
            case FieldKind.METRIC:
                return dispatch(toggleMetric(field));
            default:
                return assertUnreachable(field.kind, 'Unknown field kind');
        }
    };

    const searchedOrAllFields = searchedFields ?? fields.data;

    return fields.data.length === 0 ? (
        <SuboptimalState
            title="No fields available"
            description="No fields have been created in this view yet."
        />
    ) : (
        <Stack spacing="md" sx={{ flexGrow: 1 }}>
            <LoadingOverlay
                visible={fields.isFetching}
                opacity={0.5}
                loaderProps={{ color: 'gray', size: 'sm' }}
            />

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
                <Stack>
                    <SidebarViewFieldsGroup
                        allSelectedFields={allSelectedFieldNames}
                        fields={searchedOrAllFields.filter((field) =>
                            allSelectedFieldNames.includes(field.name),
                        )}
                        searchQuery={searchQuery}
                        handleFieldToggle={handleFieldToggle}
                    />

                    <SidebarViewFieldsGroup
                        allSelectedFields={allSelectedFieldNames}
                        fields={searchedOrAllFields
                            .filter(
                                (field) =>
                                    !allSelectedFieldNames.includes(field.name),
                            )
                            .sort(
                                (a, b) => Number(b.visible) - Number(a.visible),
                            )}
                        searchQuery={searchQuery}
                        handleFieldToggle={handleFieldToggle}
                    />
                </Stack>
            )}
        </Stack>
    );
};

export default SidebarViewFields;
