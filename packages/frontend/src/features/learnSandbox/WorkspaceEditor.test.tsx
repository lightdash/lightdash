import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stubs = vi.hoisted(() => {
    const model = {
        content: '',
        getValue: () => model.content,
        getLineCount: () => 1,
        getLineMaxColumn: () => model.content.length + 1,
    };
    const editorInstance = {
        getValue: () => model.content,
        setValue: (v: string) => {
            model.content = v;
        },
        getModel: () => model,
        executeEdits: vi.fn((_source: string, edits: { text: string }[]) => {
            model.content += edits[0].text;
            return true;
        }),
        onDidBlurEditorText: vi.fn(),
        updateOptions: vi.fn(),
        focus: vi.fn(),
    };
    const monaco = {
        editor: {
            defineTheme: vi.fn(),
            setTheme: vi.fn(),
        },
    };
    return {
        model,
        editor: editorInstance,
        monaco,
        lastEditorProps: null as unknown as Record<string, unknown>,
    };
});

vi.mock('../../components/MonacoEditor', async () => {
    const react = await import('react');
    return {
        __esModule: true,
        default: (props: Record<string, unknown>) => {
            stubs.lastEditorProps = props;
            (props.beforeMount as ((m: unknown) => void) | undefined)?.(
                stubs.monaco,
            );
            // Mirror @monaco-editor/react: onMount fires after the DOM (and
            // therefore parent refs, e.g. wrapperRef) has committed.
            react.useEffect(() => {
                (
                    props.onMount as
                        | ((e: unknown, m: unknown) => void)
                        | undefined
                )?.(stubs.editor, stubs.monaco);
                // eslint-disable-next-line react-hooks/exhaustive-deps
            }, []);
            return (
                <textarea
                    aria-label="monaco"
                    data-testid="monaco"
                    readOnly
                    value={String(props.value ?? '')}
                />
            );
        },
    };
});

vi.mock('monaco-yaml', () => ({
    configureMonacoYaml: vi.fn(() => ({ update: vi.fn() })),
}));

import WorkspaceEditor from './WorkspaceEditor';

type Props = ComponentProps<typeof WorkspaceEditor>;

const renderEditor = (overrides: Partial<Props> = {}) =>
    render(
        <MantineProvider env="test">
            <WorkspaceEditor
                path="models/orders.yml"
                content="existing"
                editable
                saving={false}
                dirty={false}
                onChange={vi.fn()}
                onBlur={vi.fn()}
                {...overrides}
            />
        </MantineProvider>,
    );

describe('WorkspaceEditor', () => {
    beforeEach(() => {
        stubs.model.content = 'existing';
        stubs.lastEditorProps = null as unknown as Record<string, unknown>;
        stubs.editor.executeEdits.mockClear();
        stubs.editor.onDidBlurEditorText.mockClear();
    });

    it('passes readOnly=true to Monaco for non-editable files and shows "Read-only"', () => {
        renderEditor({ editable: false });

        expect(
            (stubs.lastEditorProps.options as { readOnly: boolean }).readOnly,
        ).toBe(true);
        expect(screen.getByText('Read-only')).toBeInTheDocument();
    });

    it('passes readOnly=false to Monaco for editable files', () => {
        renderEditor({ editable: true, dirty: false, saving: false });

        expect(
            (stubs.lastEditorProps.options as { readOnly: boolean }).readOnly,
        ).toBe(false);
        expect(screen.getByText('Saved')).toBeInTheDocument();
    });

    it('shows "Unsaved changes" when dirty and "Saving…" while saving', () => {
        const { rerender } = renderEditor({ dirty: true, saving: false });
        expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

        rerender(
            <MantineProvider env="test">
                <WorkspaceEditor
                    path="models/orders.yml"
                    content="existing"
                    editable
                    saving
                    dirty={false}
                    onChange={vi.fn()}
                    onBlur={vi.fn()}
                />
            </MantineProvider>,
        );
        expect(screen.getByText('Saving…')).toBeInTheDocument();
    });

    it('sets data-learn-editor-state to readonly/saved/dirty/saving as appropriate', () => {
        const { container, rerender } = renderEditor({ editable: false });
        expect(
            container.querySelector('[data-learn-editor-state]'),
        ).toHaveAttribute('data-learn-editor-state', 'readonly');

        rerender(
            <MantineProvider env="test">
                <WorkspaceEditor
                    path="models/orders.yml"
                    content="existing"
                    editable
                    saving={false}
                    dirty
                    onChange={vi.fn()}
                    onBlur={vi.fn()}
                />
            </MantineProvider>,
        );
        expect(
            container.querySelector('[data-learn-editor-state]'),
        ).toHaveAttribute('data-learn-editor-state', 'dirty');
    });

    it('appends via tourEditor.setValue using executeEdits at the end of the model, prefixing a newline, and calls onChange', () => {
        const onChange = vi.fn();
        const { container } = renderEditor({ onChange, content: 'existing' });

        const wrapper = container.querySelector(
            '[data-tour-anchor="workspace-editor"]',
        ) as HTMLDivElement & {
            tourEditor?: { setValue: (v: string) => void };
        };
        expect(wrapper.tourEditor).toBeDefined();

        wrapper.tourEditor?.setValue('x');

        expect(stubs.editor.executeEdits).toHaveBeenCalledWith('learn-tour', [
            expect.objectContaining({
                range: {
                    startLineNumber: 1,
                    startColumn: 'existing'.length + 1,
                    endLineNumber: 1,
                    endColumn: 'existing'.length + 1,
                },
                text: '\nx',
                forceMoveMarkers: true,
            }),
        ]);
        expect(onChange).toHaveBeenCalledWith('existing\nx');
        // Without focus the appended text could never blur, and the page's
        // autosave runs on blur.
        expect(stubs.editor.focus).toHaveBeenCalled();
    });

    it('does not prefix a newline when the model is empty', () => {
        stubs.model.content = '';
        const onChange = vi.fn();
        const { container } = renderEditor({ onChange, content: '' });

        const wrapper = container.querySelector(
            '[data-tour-anchor="workspace-editor"]',
        ) as HTMLDivElement & {
            tourEditor?: { setValue: (v: string) => void };
        };
        wrapper.tourEditor?.setValue('first line');

        expect(stubs.editor.executeEdits).toHaveBeenCalledWith('learn-tour', [
            expect.objectContaining({ text: 'first line' }),
        ]);
        expect(onChange).toHaveBeenCalledWith('first line');
    });

    it('does not prefix a newline when the model already ends with one', () => {
        stubs.model.content = 'existing\n';
        const onChange = vi.fn();
        const { container } = renderEditor({
            onChange,
            content: 'existing\n',
        });

        const wrapper = container.querySelector(
            '[data-tour-anchor="workspace-editor"]',
        ) as HTMLDivElement & {
            tourEditor?: { setValue: (v: string) => void };
        };
        wrapper.tourEditor?.setValue('next line');

        expect(stubs.editor.executeEdits).toHaveBeenCalledWith('learn-tour', [
            expect.objectContaining({ text: 'next line' }),
        ]);
        expect(onChange).toHaveBeenCalledWith('existing\nnext line');
    });

    it('calls onBlur when the editor reports blur via onDidBlurEditorText', () => {
        const onBlur = vi.fn();
        renderEditor({ onBlur });

        const [blurCallback] = stubs.editor.onDidBlurEditorText.mock
            .calls[0] as [() => void];
        blurCallback();

        expect(onBlur).toHaveBeenCalledTimes(1);
    });

    it('renders data-tour-suggest only when tourSuggestion is provided', () => {
        const { container: withoutSuggestion } = renderEditor({
            tourSuggestion: undefined,
        });
        expect(
            withoutSuggestion.querySelector('[data-tour-suggest]'),
        ).toBeNull();

        const { container: withSuggestion } = renderEditor({
            tourSuggestion: 'add a metric',
        });
        expect(
            withSuggestion
                .querySelector('[data-tour-suggest]')
                ?.getAttribute('data-tour-suggest'),
        ).toBe('add a metric');
    });
});
