import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../../../testing/testUtils';
import { ToolCallDescription } from './ToolCallDescription';

describe('Document tool activity', () => {
    it.each([
        [
            'createContent',
            { type: 'document', content: { slug: 'hello-world' } },
            'Created Document',
            'hello-world',
        ],
        [
            'editContent',
            { type: 'document', slug: 'hello-world' },
            'Edited Document',
            'hello-world',
        ],
        [
            'readContent',
            { type: 'document', slug: 'hello-world' },
            'Read Document',
            'hello-world',
        ],
        [
            'readContent',
            { type: 'document', documentUuid: 'document-uuid' },
            'Read Document',
            'document-uuid',
        ],
    ] as const)(
        'labels %s correctly for %j',
        (toolName, toolArgs, label, identifier) => {
            renderWithProviders(
                <ToolCallDescription
                    toolName={toolName}
                    toolCall={{ toolCallId: 'call-1', toolName, toolArgs }}
                />,
            );
            expect(screen.getByText(identifier)).toBeInTheDocument();
            expect(screen.getByText(label)).toBeInTheDocument();
        },
    );
});
