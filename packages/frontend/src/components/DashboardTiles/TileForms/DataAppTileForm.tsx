import {
    ContentType,
    type ApiContentResponse,
    type ApiError,
    type DashboardDataAppTileProperties,
} from '@lightdash/common';
import { Loader, Select, Stack, Text, TextInput } from '@mantine-8/core';
import { useDebouncedValue } from '@mantine-8/hooks';
import { type UseFormReturnType } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { lightdashApi } from '../../../api';

interface DataAppTileFormProps {
    form: UseFormReturnType<DashboardDataAppTileProperties['properties']>;
}

const DATA_APP_PICKER_PAGE_SIZE = 100;

const fetchDataAppContent = (projectUuid: string, search: string) => {
    const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
    return lightdashApi<ApiContentResponse['results']>({
        version: 'v2',
        url: `/content?projectUuids=${projectUuid}&contentTypes=${ContentType.DATA_APP}&pageSize=${DATA_APP_PICKER_PAGE_SIZE}&page=1${searchParam}`,
        method: 'GET',
        body: undefined,
    });
};

const useProjectDataApps = (projectUuid: string | undefined, search: string) =>
    useQuery<ApiContentResponse['results'], ApiError>({
        queryKey: ['data-app-picker', projectUuid, search],
        queryFn: () => fetchDataAppContent(projectUuid!, search),
        enabled: !!projectUuid,
        keepPreviousData: true,
    });

const DataAppTileForm = ({ form }: DataAppTileFormProps) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [searchValue, setSearchValue] = useState('');
    const [debouncedSearch] = useDebouncedValue(searchValue, 300);
    const { data, isLoading, isFetching, error } = useProjectDataApps(
        projectUuid,
        debouncedSearch,
    );

    const options = useMemo(() => {
        if (!data) return [];
        return data.data
            .filter((item) => item.contentType === ContentType.DATA_APP)
            .map((item) => ({
                value: item.uuid,
                label: item.name || 'Untitled app',
            }));
    }, [data]);

    return (
        <Stack gap="md">
            <TextInput
                label="Title"
                placeholder="Tile title"
                required
                {...form.getInputProps('title')}
            />

            <Select
                label="Data app"
                description="Only apps that were moved to a space can be added to a dashboard."
                placeholder={isLoading ? 'Loading apps...' : 'Pick a data app'}
                searchable
                required
                data={options}
                disabled={isLoading || !!error}
                searchValue={searchValue}
                onSearchChange={setSearchValue}
                rightSection={
                    isLoading || isFetching ? <Loader size="xs" /> : undefined
                }
                nothingFoundMessage="No matching data apps"
                // Spreading `form.getInputProps('appUuid')` here breaks the
                // controlled `searchValue` — Mantine's Select forcibly syncs
                // the search input to the selected option's label whenever
                // its `value` prop ticks, which on every render erases what
                // the user typed before the debounce can fire. Wire the
                // form props by hand so Mantine sees a stable `value`.
                value={form.values.appUuid || null}
                onChange={(value) => form.setFieldValue('appUuid', value ?? '')}
                error={form.errors.appUuid}
            />

            {error && (
                <Text c="red" size="sm">
                    Failed to load apps
                </Text>
            )}
        </Stack>
    );
};

export default DataAppTileForm;
