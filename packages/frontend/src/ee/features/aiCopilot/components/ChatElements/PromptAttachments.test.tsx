import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { type ThreadComposerNode } from '../../store/aiAgentThreadComposerNodesSlice';
import { PromptAttachments } from './PromptAttachments';

const node: ThreadComposerNode = {
    artifactUuid: 'artifact-1',
    versionUuid: 'version-1',
    nodeId: 'monthly-revenue',
    title: 'Monthly revenue',
};

test.each([false, true])(
    'composer-node-only attachments remain visible and respect disabled=%s',
    (disabled) => {
        const onRemoveComposerNode =
            vi.fn<(item: ThreadComposerNode) => void>();
        renderWithProviders(
            <PromptAttachments
                externalSources={[]}
                onRemoveExternalSource={() => undefined}
                pendingCsvFiles={[]}
                threadFiles={[]}
                onRemoveThreadFile={() => undefined}
                pendingThreadFiles={[]}
                onCancelPendingFile={() => undefined}
                elementRefs={[]}
                onRemoveElementRef={() => undefined}
                composerNodes={[node]}
                onRemoveComposerNode={onRemoveComposerNode}
                disabled={disabled}
            />,
        );

        expect(screen.getByText(node.title)).toBeVisible();
        // Mantine Pill hides its remove control with CSS when disabled.
        const disabledPill = screen
            .getByText(node.title)
            .closest('[data-disabled]');
        if (disabled) {
            expect(disabledPill).toHaveAttribute('data-disabled', 'true');
        } else {
            expect(disabledPill).toBeNull();
            fireEvent.click(screen.getByRole('button', { hidden: true }));
            expect(onRemoveComposerNode).toHaveBeenCalledExactlyOnceWith(node);
        }
    },
);
