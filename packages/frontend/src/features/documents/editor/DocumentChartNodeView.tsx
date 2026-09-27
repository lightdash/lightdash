import { type NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import ErrorBoundary from '../../errorBoundary/ErrorBoundary';
import DocumentChart from '../DocumentChart';
import ReportChartFrame from '../presentation/ReportChartFrame';
import { type DocumentChartAttributes } from './documentChartNode';
import { useDocumentEditorTarget } from './DocumentEditorContext';

const DocumentChartNodeView = ({ node }: NodeViewProps) => {
    const { content, sourceIndex } = node.attrs as DocumentChartAttributes;
    const target = useDocumentEditorTarget();
    if (!content) {
        return null;
    }
    return (
        <NodeViewWrapper>
            <ErrorBoundary
                fallbackWrapper={(fallback) => (
                    <ReportChartFrame title={content.chart.name}>
                        {fallback}
                    </ReportChartFrame>
                )}
            >
                {sourceIndex !== null && (
                    <DocumentChart
                        showTitle
                        projectUuid={target.projectUuid}
                        spaceUuid={target.spaceUuid}
                        documentUuid={target.documentUuid}
                        versionUuid={target.versionUuid}
                        cellIndex={sourceIndex}
                        cell={{ type: 'chart', content }}
                    />
                )}
            </ErrorBoundary>
        </NodeViewWrapper>
    );
};

export default DocumentChartNodeView;
