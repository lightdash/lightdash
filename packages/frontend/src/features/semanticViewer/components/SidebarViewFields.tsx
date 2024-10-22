import { type SemanticLayerField } from '@lightdash/common';
import {
    ActionIcon,
    Center,
    Loader,
    LoadingOverlay,
    Stack,
    TextInput,
} from '@mantine/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { useEffect, useMemo, useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import useToaster from '../../../hooks/toaster/useToaster';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { useSemanticLayerViewFields } from '../api/hooks';
import {
    selectAllSelectedFieldNames,
    selectSemanticLayerInfo,
    selectSemanticLayerQuery,
} from '../store/selectors';
import { setFields } from '../store/semanticViewerSlice';
import SidebarViewFieldsGroup from './SidebarViewFieldsGroup';

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
    const { showToastError } = useToaster();
    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);
    const semanticLayerView = useAppSelector(
        (state) => state.semanticViewer.semanticLayerView,
    );
    const semanticLayerQuery = useAppSelector(selectSemanticLayerQuery);
    const allSelectedFieldNames = useAppSelector(selectAllSelectedFieldNames);

    const dispatch = useAppDispatch();

    const [searchQuery, setSearchQuery] = useState('');

    if (!semanticLayerView) {
        throw new Error('Impossible state');
    }

    const fields = useSemanticLayerViewFields(
        { projectUuid, semanticLayerView, semanticLayerQuery },
        { keepPreviousData: true },
    );

    useEffect(() => {
        if (!fields.data) return;

        dispatch(setFields(fields.data));
    }, [dispatch, fields.data]);

    const searchedFields = useMemo(() => {
        if (!fields.data) return;

        return getSearchResults(fields.data, searchQuery);
    }, [fields.data, searchQuery]);

    if (fields.isLoading) {
        return (
            <Center sx={{ flexGrow: 1 }}>
                <Loader color="gray" size="sm" />
            </Center>
        );
    }

    if (fields.isError) {
        showToastError({
            title: 'Failed to fetch fields',
        });

        return (
            <SuboptimalState
                title="Failed to fetch fields"
                description={
                    fields.error.error.statusCode !== 500
                        ? fields.error.error.message
                        : 'Something went wrong when trying to fetch the fields'
                }
            />
        );
    }

    const searchedOrAllFields = searchedFields ?? fields.data;

    return fields.data.length === 0 ? (
        <SuboptimalState
            title="No fields available"
            description="No fields have been created in this view yet."
        />
    ) : (
        <>
            <LoadingOverlay
                visible={fields.isFetching}
                opacity={0.5}
                loaderProps={{ color: 'gray', size: 'sm' }}
            />

            <Stack sx={{ flexGrow: 1 }}>
                <Stack
                    bg="white"
                    sx={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 1,
                    }}
                >
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

                    <SidebarViewFieldsGroup
                        containerProps={{
                            sx: { boxShadow: '0 3px 0 0 white' },
                        }}
                        groupLabel="Selected fields"
                        fields={searchedOrAllFields.filter((field) =>
                            allSelectedFieldNames.includes(field.name),
                        )}
                        searchQuery={searchQuery}
                    />
                </Stack>

                <Stack>
                    <SidebarViewFieldsGroup
                        groupLabel="Available fields"
                        fields={searchedOrAllFields.filter(
                            (field) =>
                                !allSelectedFieldNames.includes(field.name) &&
                                field.visible,
                        )}
                        searchQuery={searchQuery}
                    />

                    <SidebarViewFieldsGroup
                        groupLabel="Unavailable fields"
                        fields={searchedOrAllFields.filter(
                            (field) =>
                                !allSelectedFieldNames.includes(field.name) &&
                                !field.visible,
                        )}
                        searchQuery={searchQuery}
                    />
                </Stack>

                {searchedFields && searchedOrAllFields.length === 0 ? (
                    <SuboptimalState
                        title="No fields match search"
                        description="No fields match the search query."
                    />
                ) : null}
            </Stack>
        </>
    );
};

export default SidebarViewFields;
