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
        revealLineInCenter: vi.fn(),
        setPosition: vi.fn(),
        createDecorationsCollection: vi.fn(() => ({ clear: vi.fn() })),
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

    const tourEditorOf = (container: HTMLElement) =>
        (
            container.querySelector(
                '[data-tour-anchor="workspace-editor"]',
            ) as HTMLDivElement & {
                tourEditor?: { setValue: (v: string) => void };
            }
        ).tourEditor;

    it('types the snippet in at the end of the model after a newline, then reports the change and focuses', () => {
        vi.useFakeTimers();
        try {
            const onChange = vi.fn();
            const { container } = renderEditor({
                onChange,
                content: 'existing',
            });
            const wrapper = container.querySelector(
                '[data-tour-anchor="workspace-editor"]',
            ) as HTMLDivElement;
            const inputs = vi.fn();
            wrapper.addEventListener('input', inputs);

            tourEditorOf(container)?.setValue('ab');

            // The newline and the first character land at once; the rest
            // arrive one per tick, and the change is reported only at the end.
            expect(stubs.model.content).toBe('existing\na');
            expect(onChange).not.toHaveBeenCalled();
            expect(stubs.editor.executeEdits).toHaveBeenCalledWith(
                'learn-tour',
                [
                    expect.objectContaining({
                        range: {
                            startLineNumber: 1,
                            startColumn: 'existing'.length + 1,
                            endLineNumber: 1,
                            endColumn: 'existing'.length + 1,
                        },
                        text: '\n',
                        forceMoveMarkers: true,
                    }),
                ],
            );
            vi.runAllTimers();
            expect(stubs.model.content).toBe('existing\nab');
            expect(onChange).toHaveBeenCalledWith('existing\nab');
            // One input event per character keeps the tour's typed-step
            // advance waiting until the last one has landed.
            expect(inputs).toHaveBeenCalledTimes(2);
            expect(stubs.editor.revealLineInCenter).toHaveBeenCalled();
            expect(
                stubs.editor.createDecorationsCollection,
            ).toHaveBeenCalledWith([
                expect.objectContaining({
                    options: expect.objectContaining({ isWholeLine: true }),
                }),
            ]);
            // Without focus the appended text could never blur, and the
            // page's autosave runs on blur.
            expect(stubs.editor.focus).toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('ignores Use it while a snippet is still being typed, and once it is already there', () => {
        vi.useFakeTimers();
        try {
            const onChange = vi.fn();
            const { container } = renderEditor({
                onChange,
                content: 'existing',
            });
            const tour = tourEditorOf(container);
            tour?.setValue('abc');
            vi.advanceTimersByTime(30);
            tour?.setValue('abc');
            vi.runAllTimers();
            expect(stubs.model.content).toBe('existing\nabc');
            expect(onChange).toHaveBeenCalledTimes(1);
            tour?.setValue('abc');
            vi.runAllTimers();
            expect(stubs.model.content).toBe('existing\nabc');
            expect(onChange).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('does not prefix a newline when the model is empty', () => {
        vi.useFakeTimers();
        try {
            stubs.model.content = '';
            const onChange = vi.fn();
            const { container } = renderEditor({ onChange, content: '' });
            tourEditorOf(container)?.setValue('first line');
            vi.runAllTimers();
            expect(stubs.model.content).toBe('first line');
            expect(onChange).toHaveBeenCalledWith('first line');
        } finally {
            vi.useRealTimers();
        }
    });

    it('does not prefix a newline when the model already ends with one', () => {
        vi.useFakeTimers();
        try {
            stubs.model.content = 'existing\n';
            const onChange = vi.fn();
            const { container } = renderEditor({
                onChange,
                content: 'existing\n',
            });
            tourEditorOf(container)?.setValue('next line');
            vi.runAllTimers();
            expect(stubs.model.content).toBe('existing\nnext line');
            expect(onChange).toHaveBeenCalledWith('existing\nnext line');
        } finally {
            vi.useRealTimers();
        }
    });

    it('calls onBlur when the editor reports blur via onDidBlurEditorText', () => {
        const onBlur = vi.fn();
        renderEditor({ onBlur });

        const [blurCallback] = stubs.editor.onDidBlurEditorText.mock
            .calls[0] as [() => void];
        blurCallback();

        expect(onBlur).toHaveBeenCalledTimes(1);
    });

    it('renders a static data-tour-suggest on the editor wrapper', () => {
        const { container } = renderEditor();

        expect(
            container
                .querySelector('[data-tour-anchor="workspace-editor"]')
                ?.getAttribute('data-tour-suggest'),
        ).toBe('# Edited in the Learn workspace');
    });
});
