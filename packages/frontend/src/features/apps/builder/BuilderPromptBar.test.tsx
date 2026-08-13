import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type DataAppModelSelection } from '../hooks/useDataAppModelSelection';
import { type DataAppVizBuildState } from '../hooks/useDataAppVizBuild';
import BuilderPromptBar from './BuilderPromptBar';

// The real composer is TipTap; a text input carries the same handle contract.
vi.mock('../../../components/common/PromptComposer/PromptComposer', () => ({
    default: forwardRef<
        { getText: () => string; clear: () => void },
        {
            placeholder: string;
            toolbarRight: ReactNode;
            onEmptyChange: (isEmpty: boolean) => void;
        }
    >(function MockComposer({ placeholder, toolbarRight, onEmptyChange }, ref) {
        const inputRef = useRef<HTMLInputElement>(null);
        useImperativeHandle(ref, () => ({
            getText: () => inputRef.current?.value ?? '',
            clear: () => {
                if (inputRef.current) inputRef.current.value = '';
            },
        }));
        return (
            <div>
                <input
                    ref={inputRef}
                    placeholder={placeholder}
                    onChange={(e) => onEmptyChange(e.target.value === '')}
                />
                {toolbarRight}
            </div>
        );
    }),
}));

vi.mock('../hooks/useVizComposerAttachments', () => ({
    useVizComposerAttachments: () => ({
        attachments: [],
        fileIds: [],
        isUploading: false,
        add: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
    }),
}));

const buildState = (send: () => void): DataAppVizBuildState =>
    ({
        draftAppUuid: 'draft-1',
        appUuid: null,
        draft: null,
        startedAt: null,
        claimedVersion: null,
        isBuilding: false,
        pendingPrompt: null,
        error: null,
        send,
        retry: null,
        cancel: null,
        discard: null,
    }) as unknown as DataAppVizBuildState;

const modelSelection = (
    selectedModel: DataAppModelSelection['selectedModel'],
): DataAppModelSelection => ({
    selectedModel,
    visibleModels: ['opus', 'sonnet', 'haiku'],
    isLoading: false,
    setModel: vi.fn(),
    clearPick: vi.fn(),
});

describe('BuilderPromptBar', () => {
    it('builds with the picked model', async () => {
        const send = vi.fn();
        renderWithProviders(
            <BuilderPromptBar
                projectUuid="p1"
                composerAppUuid="draft-1"
                hasVersions={false}
                build={buildState(send)}
                onCancelBuild={null}
                modelSelection={modelSelection('haiku')}
            />,
        );

        await userEvent.click(
            screen.getByPlaceholderText('Describe a new chart type…'),
        );
        await userEvent.keyboard('a funnel of signup steps');
        await userEvent.click(screen.getByLabelText('Send'));

        expect(send).toHaveBeenCalledWith({
            description: 'a funnel of signup steps',
            fileIds: [],
            claudeModel: 'haiku',
        });
    });

    it('shows the model it will build with', () => {
        renderWithProviders(
            <BuilderPromptBar
                projectUuid="p1"
                composerAppUuid="draft-1"
                hasVersions
                build={buildState(vi.fn())}
                onCancelBuild={null}
                modelSelection={modelSelection('opus')}
            />,
        );

        expect(screen.getByText('Opus')).toBeInTheDocument();
    });
});
