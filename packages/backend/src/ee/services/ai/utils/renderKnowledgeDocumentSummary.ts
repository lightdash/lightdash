import type { AiAgentDocumentStructuredSummary } from '@lightdash/common';
import { escapeXmlText, xmlBuilder } from '../xmlBuilder';

export const renderKnowledgeDocumentSummary = (
    summary: AiAgentDocumentStructuredSummary,
): string[] => {
    const children = [
        xmlBuilder('description', null, escapeXmlText(summary.description)),
    ];
    if (summary.definedTerms.length > 0) {
        children.push(
            xmlBuilder(
                'defines',
                null,
                escapeXmlText(summary.definedTerms.join(', ')),
            ),
        );
    }
    if (summary.relatedExploreNames.length > 0) {
        children.push(
            xmlBuilder(
                'applies_to_explores',
                null,
                escapeXmlText(summary.relatedExploreNames.join(', ')),
            ),
        );
    }
    if (summary.useWhen) {
        children.push(
            xmlBuilder('use_when', null, escapeXmlText(summary.useWhen)),
        );
    }
    if (summary.warning) {
        children.push(
            xmlBuilder('warning', null, escapeXmlText(summary.warning)),
        );
    }
    return children;
};
