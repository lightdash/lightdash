import { FeatureFlags, type DocumentSummary } from '@lightdash/common';
import { Anchor, Button, Group, Stack, Title } from '@mantine/core';
import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
} from '../components/common/ContentTable';
import EmptyStateLoader from '../components/common/EmptyStateLoader';
import Page from '../components/common/Page/Page';
import PageHeader from '../components/common/Page/PageHeader';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import TruncatedText from '../components/common/TruncatedText';
import {
    DOCUMENT_PAGE_SIZE,
    useDocuments,
} from '../features/documents/useDocuments';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';

const columns: ContentTableColumnDef<DocumentSummary>[] = [
    {
        accessorKey: 'name',
        header: 'Name',
        Cell: ({ row }) => (
            <Anchor
                component={Link}
                to={`/projects/${row.original.projectUuid}/documents/${row.original.documentUuid}`}
            >
                <TruncatedText maxWidth="100%">
                    {row.original.name}
                </TruncatedText>
            </Anchor>
        ),
    },
    {
        accessorKey: 'description',
        header: 'Description',
        Cell: ({ row }) => (
            <TruncatedText c="dimmed" maxWidth="100%">
                {row.original.description || '—'}
            </TruncatedText>
        ),
    },
    {
        accessorKey: 'updatedAt',
        header: 'Updated',
        Cell: ({ row }) => new Date(row.original.updatedAt).toLocaleString(),
    },
];

const DocumentsContent = ({ projectUuid }: { projectUuid: string }) => {
    const [offset, setOffset] = useState(0);
    const query = useDocuments(projectUuid, offset);
    const table = useContentTable({
        columns,
        data: query.data?.items ?? [],
        getRowId: (document) => document.documentUuid,
        enablePagination: false,
        enableSorting: false,
        enableTopToolbar: false,
        enableBottomToolbar: false,
        emptyState: {
            title: 'No documents yet',
            description: 'Documents shared with you will appear here.',
        },
    });

    if (query.isInitialLoading) {
        return <EmptyStateLoader title="Loading documents" />;
    }
    if (query.isError) {
        return (
            <SuboptimalState
                title="Unable to load documents"
                description={query.error.error.message}
                action={
                    <Button
                        variant="default"
                        onClick={() => {
                            void query.refetch();
                        }}
                    >
                        Retry
                    </Button>
                }
            />
        );
    }
    const nextOffset = query.data?.nextOffset;
    return (
        <Stack gap="lg">
            <ContentTable table={table} />
            {(offset > 0 ||
                (nextOffset !== null && nextOffset !== undefined)) && (
                <Group justify="flex-end">
                    <Button
                        variant="default"
                        disabled={offset === 0 || query.isFetching}
                        onClick={() =>
                            setOffset((current) =>
                                Math.max(0, current - DOCUMENT_PAGE_SIZE),
                            )
                        }
                    >
                        Previous
                    </Button>
                    <Button
                        variant="default"
                        disabled={nextOffset == null || query.isFetching}
                        onClick={() => {
                            if (nextOffset != null) {
                                setOffset(nextOffset);
                            }
                        }}
                    >
                        Next
                    </Button>
                </Group>
            )}
        </Stack>
    );
};

const Documents = () => {
    const projectUuid = useProjectUuid();
    const flag = useServerFeatureFlag(FeatureFlags.Documents);
    if (!projectUuid || flag.isInitialLoading) {
        return <EmptyStateLoader title="Loading documents" />;
    }
    if (flag.isError || !flag.data?.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }
    return (
        <Page
            title="Documents"
            withCenteredRoot
            withCenteredContent
            withXLargePaddedContent
            withLargeContent
            header={
                <PageHeader>
                    <Title order={4}>Documents</Title>
                </PageHeader>
            }
        >
            <DocumentsContent key={projectUuid} projectUuid={projectUuid} />
        </Page>
    );
};

export default Documents;
