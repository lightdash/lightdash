import { getDocumentUrl, type DocumentSavedChartKind } from '@lightdash/common';
import { Anchor, List, ScrollArea } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import Callout from '../../components/common/Callout';
import { useDocumentsLinkingChart } from './useDocumentsLinkingChart';

type Props = {
    projectUuid: string | undefined;
    kind: DocumentSavedChartKind;
    chartUuid: string;
    softDeleteEnabled: boolean;
};

/** Warns, before a chart is deleted, which Documents show it live. */
const DocumentsLinkingChartCallout: FC<Props> = ({
    projectUuid,
    kind,
    chartUuid,
    softDeleteEnabled,
}) => {
    const { data: documents } = useDocumentsLinkingChart(
        projectUuid,
        kind,
        chartUuid,
    );
    if (!projectUuid || !documents || documents.length === 0) {
        return null;
    }
    const count = `${documents.length} document${documents.length > 1 ? 's' : ''}`;
    return (
        <Callout
            variant="warning"
            title={
                softDeleteEnabled
                    ? `This chart is linked from ${count}. They'll show it as unavailable until it's restored:`
                    : `This chart is linked from ${count}. They'll show it as unavailable:`
            }
        >
            <ScrollArea.Autosize mah="200px">
                <List>
                    {documents.map((document) => (
                        <List.Item key={document.documentUuid}>
                            <Anchor
                                component={Link}
                                fz="sm"
                                target="_blank"
                                to={getDocumentUrl(
                                    projectUuid,
                                    document.documentUuid,
                                    document.slug,
                                )}
                            >
                                {document.name}
                            </Anchor>
                        </List.Item>
                    ))}
                </List>
            </ScrollArea.Autosize>
        </Callout>
    );
};

export default DocumentsLinkingChartCallout;
