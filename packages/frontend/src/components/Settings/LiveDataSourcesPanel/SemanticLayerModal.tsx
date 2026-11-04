import {
    type ApiExploreResults,
    type ExternalConnection,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Code,
    Group,
    SegmentedControl,
    Stack,
    Table,
    Text,
} from '@mantine/core';
import { IconRefresh, IconStack2 } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import {
    useLiveSourceExplores,
    useRefreshLiveSourceExplores,
} from '../../../features/externalConnections/hooks/useLiveSourceExplores';
import { getDefaultDateRangeNote } from '../../../features/externalConnections/liveSources/apiSourceExplore';
import Callout from '../../common/Callout';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import ErrorState from '../../common/ErrorState';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import {
    getSemanticLayerFields,
    toSemanticLayerYaml,
    type SemanticLayerField,
} from './semanticLayerView';

type View = 'fields' | 'yaml';

const FieldRow: FC<{ field: SemanticLayerField }> = ({ field }) => (
    <Table.Tr>
        <Table.Td>
            <Text fz="sm" fw={500}>
                {field.label}
            </Text>
            {field.description && (
                <Text fz="xs" c="dimmed" lineClamp={2}>
                    {field.description}
                </Text>
            )}
        </Table.Td>
        <Table.Td>
            <Group gap={4} wrap="nowrap">
                <Badge
                    size="xs"
                    variant="light"
                    color={field.kind === 'metric' ? 'orange' : 'blue'}
                >
                    {field.kind}
                </Badge>
                <Text span fz="xs" c="dimmed">
                    {field.type}
                </Text>
            </Group>
        </Table.Td>
        <Table.Td>
            <Code>{field.apiName}</Code>
        </Table.Td>
        <Table.Td ta="right">
            {field.filterOperators.length > 0 ? (
                field.filterOperators.length
            ) : (
                <Text span fz="sm" c="dimmed">
                    None
                </Text>
            )}
        </Table.Td>
    </Table.Tr>
);

const SemanticLayerFields: FC<{ explore: ApiExploreResults }> = ({
    explore,
}) => {
    const dateRangeNote = getDefaultDateRangeNote(explore);
    return (
        <Stack gap="xs">
            {dateRangeNote && <Text fz="sm">{dateRangeNote}</Text>}
            <Table.ScrollContainer minWidth={560}>
                <Table striped fz="sm" verticalSpacing={4}>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Field</Table.Th>
                            <Table.Th>Type</Table.Th>
                            <Table.Th>Integration name</Table.Th>
                            <Table.Th ta="right">Filters</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {getSemanticLayerFields(explore).map((field) => (
                            <FieldRow
                                key={`${field.kind}-${field.name}`}
                                field={field}
                            />
                        ))}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
        </Stack>
    );
};

type Props = {
    projectUuid: string;
    connection: ExternalConnection;
    onClose: () => void;
};

/** Read-only view of the fields and rules a live data source answers metric queries with. */
export const SemanticLayerModal: FC<Props> = ({
    projectUuid,
    connection,
    onClose,
}) => {
    const [view, setView] = useState<View>('fields');
    const params = {
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    };
    const { data: explores, isLoading, error } = useLiveSourceExplores(params);
    const refresh = useRefreshLiveSourceExplores();
    const semanticLayerYaml = useMemo(
        () => (explores ? toSemanticLayerYaml(explores) : ''),
        [explores],
    );

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={`${connection.name} semantic layer`}
            icon={IconStack2}
            size="xl"
            cancelLabel="Close"
            leftActions={
                <Button
                    variant="default"
                    leftSection={<MantineIcon icon={IconRefresh} />}
                    loading={refresh.isLoading}
                    onClick={() => refresh.mutate(params)}
                >
                    Refresh fields
                </Button>
            }
        >
            <Stack gap="sm">
                <Text fz="sm" c="dimmed">
                    The fields and filters queries on this source can use.
                    Refresh after adding custom dimensions or properties in the
                    integration.
                </Text>

                {isLoading && (
                    <EmptyStateLoader mih={240} title="Loading fields" />
                )}
                {error && (
                    <ErrorState error={error.error} hasMarginTop={false} />
                )}
                {explores && explores.length === 0 && (
                    <Callout variant="warning" title="No fields yet">
                        Refresh to read this source's fields from its
                        integration.
                    </Callout>
                )}

                {explores && explores.length > 0 && (
                    <>
                        <SegmentedControl
                            aria-label="Semantic layer view"
                            value={view}
                            onChange={(value) => setView(value as View)}
                            data={[
                                { label: 'Fields', value: 'fields' },
                                { label: 'YAML', value: 'yaml' },
                            ]}
                        />
                        {view === 'yaml' ? (
                            <Code block>{semanticLayerYaml}</Code>
                        ) : (
                            explores.map((explore) => (
                                <SemanticLayerFields
                                    key={explore.name}
                                    explore={explore}
                                />
                            ))
                        )}
                    </>
                )}
            </Stack>
        </MantineModal>
    );
};
