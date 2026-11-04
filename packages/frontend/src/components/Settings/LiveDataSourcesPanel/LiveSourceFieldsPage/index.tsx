import { FeatureFlags, type LiveSourceField } from '@lightdash/common';
import { Button, Center, Text } from '@mantine/core';
import { IconFilter, IconRefresh, IconSearch } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { Navigate, useParams } from 'react-router';
import classes from '../../../../ee/features/serviceAccounts/ServiceAccountsToolbar.module.css';
import { useExternalConnections } from '../../../../features/externalConnections/hooks/useExternalConnections';
import {
    useLiveSourceFields,
    useRefreshLiveSourceFields,
    useUpdateLiveSourceFields,
} from '../../../../features/externalConnections/hooks/useLiveSourceFields';
import { getLiveSource } from '../../../../features/externalConnections/liveSources/liveSourceCatalog';
import { getSemanticStudioSourceUrl } from '../../../../features/semanticStudio/urls';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import { ContentTable, useContentTable } from '../../../common/ContentTable';
import EmptyStateLoader from '../../../common/EmptyStateLoader';
import ErrorState from '../../../common/ErrorState';
import MantineIcon from '../../../common/MantineIcon';
import { SettingsPage } from '../../../common/Settings/SettingsPage';
import EditFieldModal from './EditFieldModal';
import { getFieldsColumns } from './fieldsColumns';
import FieldsToolbar from './FieldsToolbar';
import {
    filterFields,
    getFieldChange,
    getGroups,
    getIntegrationCopy,
    getViewFields,
    type FieldFilters,
} from './liveSourceFieldsView';
import StopUsingFieldModal from './StopUsingFieldModal';

const NO_FILTERS: FieldFilters = {
    view: 'all',
    search: '',
    kinds: [],
    groups: [],
    showInternal: false,
};

const ROW_HEIGHT = 57;

const getEmptyMessage = (filters: FieldFilters, hasActiveFilters: boolean) => {
    if (filters.search) {
        return `No fields matching "${filters.search}"`;
    }
    if (hasActiveFilters || filters.view === 'all') {
        return 'No fields match the current filters';
    }
    return filters.view === 'available'
        ? 'Every field is in use'
        : 'No fields are in use';
};

type Props = {
    projectUuid: string;
};

const LiveSourceFieldsEditor: FC<Props> = ({ projectUuid }) => {
    const { connectionUuid = '' } = useParams<{ connectionUuid: string }>();
    const listUrl = `/generalSettings/projectManagement/${projectUuid}/liveDataSources`;
    const params = { projectUuid, connectionUuid };
    const { data: connections } = useExternalConnections(projectUuid);
    const { data, isLoading, error } = useLiveSourceFields(params);
    const update = useUpdateLiveSourceFields(params);
    const refresh = useRefreshLiveSourceFields(params);

    const connection = connections?.find(
        (candidate) => candidate.externalConnectionUuid === connectionUuid,
    );
    const connector = connection?.apiSource?.connector;
    const integration = connector ? getLiveSource(connector) : null;
    const copy = connector ? getIntegrationCopy(connector) : null;

    const [filters, setFilters] = useState(NO_FILTERS);
    const [editingName, setEditingName] = useState<string | null>(null);
    const [stoppingName, setStoppingName] = useState<string | null>(null);
    const [usingName, setUsingName] = useState<string | null>(null);

    const fields = useMemo(() => data?.fields ?? [], [data]);
    const groups = useMemo(() => getGroups(fields), [fields]);
    const viewFields = useMemo(
        () => getViewFields(fields, filters),
        [fields, filters],
    );
    const rows = useMemo(
        () => filterFields(viewFields, filters),
        [viewFields, filters],
    );
    const findField = (name: string | null) =>
        fields.find((field) => field.name === name) ?? null;
    const editingField = findField(editingName);
    const stoppingField = findField(stoppingName);
    const hasActiveFilters =
        filters.search.length > 0 ||
        filters.kinds.length > 0 ||
        filters.groups.length > 0 ||
        filters.showInternal;
    const clearFilters = () =>
        setFilters({ ...NO_FILTERS, view: filters.view });

    const { mutate: updateFields } = update;
    const columns = useMemo(
        () =>
            getFieldsColumns({
                onEdit: (field: LiveSourceField) => setEditingName(field.name),
                onUse: (field: LiveSourceField) => {
                    setUsingName(field.name);
                    updateFields([{ name: field.name, inUse: true }], {
                        onSettled: () => setUsingName(null),
                    });
                },
                usingFieldName: usingName,
            }),
        [updateFields, usingName],
    );

    const table = useContentTable({
        columns,
        data: rows,
        getRowId: (field) => field.name,
        enablePagination: false,
        enableSorting: true,
        enableRowVirtualization: true,
        rowVirtualizerProps: { estimateSize: () => ROW_HEIGHT },
        enableTopToolbar: true,
        enableBottomToolbar: false,
        initialState: { sorting: [{ id: 'status', desc: false }] },
        mantineTableContainerProps: { mah: 'calc(100dvh - 300px)' },
        mantineTableBodyCellProps: { py: 'sm' },
        mantineTableProps: { highlightOnHover: true },
        renderEmptyRowsFallback: () => (
            <Center className={classes.emptyState}>
                <MantineIcon
                    icon={filters.search ? IconSearch : IconFilter}
                    size="xl"
                    color="ldGray.4"
                    className={classes.emptyStateIcon}
                />
                <Text fz="sm" fw={500} c="dimmed">
                    {getEmptyMessage(filters, hasActiveFilters)}
                </Text>
                {hasActiveFilters && (
                    <Button variant="subtle" size="xs" onClick={clearFilters}>
                        Clear all filters
                    </Button>
                )}
            </Center>
        ),
        renderTopToolbar: () => (
            <FieldsToolbar
                filters={filters}
                onChange={setFilters}
                onClear={clearFilters}
                hasActiveFilters={hasActiveFilters}
                fields={fields}
                viewFields={viewFields}
                groups={groups}
                integrationLabel={integration?.label ?? ''}
                internalFieldsHint={copy?.internalFieldsHint ?? null}
            />
        ),
    });

    if (connections && !connection?.apiSource) {
        return <Navigate to={listUrl} replace />;
    }

    return (
        <SettingsPage
            title={connection?.name ?? integration?.label ?? 'Fields'}
            breadcrumbs={[{ title: 'Live data sources', to: listUrl }]}
            description={copy?.description}
            actions={
                <Button
                    size="xs"
                    variant="default"
                    leftSection={<MantineIcon icon={IconRefresh} />}
                    loading={refresh.isLoading}
                    onClick={() => refresh.mutate()}
                >
                    Refresh fields
                </Button>
            }
        >
            {isLoading && <EmptyStateLoader mih={240} title="Loading fields" />}
            {error && <ErrorState error={error.error} hasMarginTop={false} />}
            {data && <ContentTable table={table} />}

            {editingField && (
                <EditFieldModal
                    field={editingField}
                    groups={groups}
                    isSaving={update.isLoading}
                    onClose={() => setEditingName(null)}
                    onStopUsing={() => setStoppingName(editingField.name)}
                    onSave={(next) => {
                        const change = getFieldChange(editingField, next);
                        if (!change) {
                            setEditingName(null);
                            return;
                        }
                        update.mutate([change], {
                            onSuccess: () => setEditingName(null),
                        });
                    }}
                />
            )}
            {stoppingField && (
                <StopUsingFieldModal
                    field={stoppingField}
                    isStopping={update.isLoading}
                    onClose={() => setStoppingName(null)}
                    onConfirm={() =>
                        update.mutate(
                            [{ name: stoppingField.name, inUse: false }],
                            {
                                onSuccess: () => {
                                    setStoppingName(null);
                                    setEditingName(null);
                                },
                            },
                        )
                    }
                />
            )}
        </SettingsPage>
    );
};

/**
 * Field editing moved to Semantic Layer. While its flag is on, old links
 * to this page land on the same source there; otherwise nothing changes.
 */
const LiveSourceFieldsPage: FC<Props> = ({ projectUuid }) => {
    const { connectionUuid = '' } = useParams<{ connectionUuid: string }>();
    const semanticStudioFlag = useServerFeatureFlag(
        FeatureFlags.SemanticStudio,
    );
    if (semanticStudioFlag.isInitialLoading) return <EmptyStateLoader />;
    if (semanticStudioFlag.data?.enabled) {
        return (
            <Navigate
                to={getSemanticStudioSourceUrl(projectUuid, connectionUuid)}
                replace
            />
        );
    }
    return <LiveSourceFieldsEditor projectUuid={projectUuid} />;
};

export default LiveSourceFieldsPage;
