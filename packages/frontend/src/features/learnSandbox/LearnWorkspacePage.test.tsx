import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type WorkspaceAccess } from './useWorkspaceAccess';

const ACTIVE_UUID = '11111111-1111-1111-1111-111111111111';

const state = vi.hoisted(() => ({
    access: { state: 'loading' } as {
        state: string;
        to?: string;
        projectUuid?: string;
        trainingProjectUuid?: string;
    },
    files: [] as { path: string; editable: boolean }[],
    filesError: null as { error: { message: string } } | null,
    file: { data: undefined } as {
        data: { path: string; content: string; editable: boolean } | undefined;
    },
    fileError: null as { error: { message: string } } | null,
    saveIsLoading: false,
    runIsLoading: false,
    pollerAnswered: true,
    calls: [] as string[],
    saveMutateAsync: vi.fn(),
    runMutateAsync: vi.fn(),
    useWorkspaceFile: vi.fn(),
    useCommandOutput: vi.fn(),
    showToastApiError: vi.fn(),
}));

vi.mock('./useWorkspaceAccess', () => ({
    useWorkspaceAccess: () => state.access as WorkspaceAccess,
}));

vi.mock('../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => ({
        projectUuid: 'copy-1',
        project: { name: 'Jane’s training copy' },
    }),
}));

vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastApiError: state.showToastApiError }),
}));

vi.mock('./hooks/useWorkspaceFiles', () => ({
    useWorkspaceFiles: () => ({
        data: state.files,
        error: state.filesError,
        isError: state.filesError !== null,
    }),
}));

// Keyed on the requested path, the way the real query is: a path other than
// the one `state.file.data` currently holds has not answered yet, so the
// mock reports it as still loading rather than handing back the previous
// selection's data (there is no `keepPreviousData` any more).
vi.mock('./hooks/useWorkspaceFile', () => ({
    useWorkspaceFile: (projectUuid: string, path: string | null) => {
        state.useWorkspaceFile(projectUuid, path);
        const data =
            path && state.file.data?.path === path
                ? state.file.data
                : undefined;
        return {
            data,
            error: state.fileError,
            isError: state.fileError !== null,
        };
    },
}));

vi.mock('./hooks/useSaveWorkspaceFile', () => ({
    useSaveWorkspaceFile: () => ({
        mutateAsync: state.saveMutateAsync,
        isLoading: state.saveIsLoading,
    }),
}));

vi.mock('./hooks/useRunCommand', () => ({
    useRunCommand: () => ({
        mutateAsync: state.runMutateAsync,
        isLoading: state.runIsLoading,
    }),
}));

// The real poller empties its state whenever the command it watches
// changes, so the stand-in derives what it shows from that uuid alone.
vi.mock('./hooks/useCommandOutput', () => ({
    useCommandOutput: (projectUuid: string, commandUuid: string | null) => {
        state.useCommandOutput(projectUuid, commandUuid);
        const answered = commandUuid !== null && state.pollerAnswered;
        return {
            status: answered ? 'done' : null,
            exitCode: answered ? 0 : null,
            startedAt: null,
            finishedAt: null,
            chunks: answered
                ? [{ seq: 1, stream: 'stdout', text: `${commandUuid} output` }]
                : [],
            error: null,
            isActive: false,
        };
    },
}));

// jsdom has no layout, so every resize handle's rect is 0×0 at the origin and
// The split layout is not what this page's test is about, and the real
// splitter measures its container, which jsdom cannot do.
vi.mock('../../components/common/ResizableSplitter', () => {
    const Splitter = ({ children }: PropsWithChildren) => <div>{children}</div>;
    Splitter.Pane = ({ children }: PropsWithChildren) => <div>{children}</div>;
    return { default: Splitter };
});

// Stand-ins for the three panes: each pane has its own test file, so the
// page's test only needs the handles it wires up.
vi.mock('./FileTree', () => ({
    default: ({
        files,
        selectedPath,
        onSelect,
    }: {
        files: { path: string }[];
        selectedPath: string | null;
        onSelect: (path: string) => void;
    }) => (
        <div data-testid="file-tree" data-selected={selectedPath ?? ''}>
            {files.map((file) => (
                <button
                    key={file.path}
                    type="button"
                    onClick={() => onSelect(file.path)}
                >
                    {file.path}
                </button>
            ))}
        </div>
    ),
}));

vi.mock('./WorkspaceEditor', () => ({
    default: ({
        path,
        content,
        editable,
        saving,
        dirty,
        onChange,
        onBlur,
    }: {
        path: string;
        content: string;
        editable: boolean;
        saving: boolean;
        dirty: boolean;
        onChange: (content: string) => void;
        onBlur: () => void;
    }) => (
        <div
            data-testid="editor"
            data-path={path}
            data-editable={String(editable)}
            data-saving={String(saving)}
            data-dirty={String(dirty)}
        >
            <textarea
                aria-label="File"
                value={content}
                onChange={(event) => onChange(event.currentTarget.value)}
                onBlur={onBlur}
            />
        </div>
    ),
}));

vi.mock('./Terminal', () => ({
    default: ({
        value,
        onValueChange,
        onRun,
        busy,
        disabled,
        output,
    }: {
        value: string;
        onValueChange: (value: string) => void;
        onRun: () => void;
        busy: boolean;
        disabled: boolean;
        output: { error: string | null; chunks: { text: string }[] };
    }) => (
        <div
            data-testid="terminal"
            data-busy={String(busy)}
            data-disabled={String(disabled)}
        >
            <input
                aria-label="Command"
                value={value}
                onChange={(event) => onValueChange(event.currentTarget.value)}
            />
            <button type="button" onClick={onRun}>
                Run
            </button>
            <span data-testid="terminal-error">{output.error ?? ''}</span>
            <span data-testid="terminal-chunks">
                {output.chunks.map((chunk) => chunk.text).join('\n')}
            </span>
        </div>
    ),
}));

import LearnWorkspacePage from './LearnWorkspacePage';

const renderPage = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    render(
        <MemoryRouter initialEntries={['/projects/copy-1/learn/workspace']}>
            <QueryClientProvider client={queryClient}>
                <MantineProvider env="test">
                    <LearnWorkspacePage />
                </MantineProvider>
            </QueryClientProvider>
        </MemoryRouter>,
    );
    return { invalidateQueries };
};

const selectOrders = async (user: ReturnType<typeof userEvent.setup>) => {
    state.file.data = {
        path: 'models/orders.yml',
        content: 'version: 2\n',
        editable: true,
    };
    await user.click(screen.getByRole('button', { name: 'models/orders.yml' }));
};

describe('LearnWorkspacePage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.access = {
            state: 'ready',
            projectUuid: 'copy-1',
            trainingProjectUuid: 'training-1',
        };
        state.files = [
            { path: 'models/orders.yml', editable: true },
            { path: 'dbt_project.yml', editable: false },
        ];
        state.filesError = null;
        state.file = { data: undefined };
        state.fileError = null;
        state.saveIsLoading = false;
        state.runIsLoading = false;
        state.pollerAnswered = true;
        state.calls = [];
        state.saveMutateAsync = vi.fn(async () => {
            state.calls.push('save');
            return undefined;
        });
        state.runMutateAsync = vi.fn(async () => {
            state.calls.push('run');
            return { commandUuid: 'command-1' };
        });
    });

    it('renders the tree, the terminal and the empty editor state when ready', () => {
        renderPage();

        expect(screen.getByTestId('file-tree')).toBeInTheDocument();
        expect(screen.getByTestId('terminal')).toBeInTheDocument();
        expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
        expect(screen.getByText('Pick a file to start')).toBeInTheDocument();
        expect(screen.getByText('Jane’s training copy')).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Back to library' }),
        ).toHaveAttribute('href', '/projects/training-1/learn');
    });

    it('shows an inline error in the tree pane when the files query fails', () => {
        state.filesError = {
            error: { message: 'Could not reach the sandbox' },
        };
        renderPage();

        expect(
            screen.getByText('Could not reach the sandbox'),
        ).toBeInTheDocument();
        expect(screen.queryByTestId('file-tree')).not.toBeInTheDocument();
    });

    it('shows an inline error in the editor pane when the file query fails', async () => {
        const user = userEvent.setup();
        renderPage();

        state.fileError = { error: { message: 'File not found' } };
        await user.click(
            screen.getByRole('button', { name: 'models/orders.yml' }),
        );

        await waitFor(() =>
            expect(screen.getByText('File not found')).toBeInTheDocument(),
        );
        expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    });

    it('does not run when there is a draft but the file has not loaded', async () => {
        const user = userEvent.setup();
        renderPage();
        await selectOrders(user);
        await screen.findByTestId('editor');

        // fireEvent throughout: a real click or type would focus/blur the
        // editor, and the blur autosave (against the file as it was at that
        // instant) would save the draft away before the file query's own
        // update is observed, hiding the case under test.
        fireEvent.change(screen.getByLabelText('File'), {
            target: { value: 'version: 2\nx' },
        });
        expect(screen.getByTestId('editor')).toHaveAttribute(
            'data-dirty',
            'true',
        );

        // The file query no longer has data (e.g. it started reloading and
        // has not answered yet), but the draft the learner typed is still
        // held by the page. A second change forces the page to re-render
        // and read the file query's new value before Run is clicked.
        state.file = { data: undefined };
        fireEvent.change(screen.getByLabelText('Command'), {
            target: { value: 'dbt parse' },
        });
        await waitFor(() =>
            expect(
                document.querySelector('[data-learn-editor-loading]'),
            ).toBeInTheDocument(),
        );
        expect(
            screen.queryByText('Pick a file to start'),
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Run' }));

        await waitFor(() =>
            expect(screen.getByTestId('terminal-error')).toHaveTextContent(
                'The file could not be saved, so nothing ran',
            ),
        );
        expect(state.runMutateAsync).not.toHaveBeenCalled();
    });

    it('redirects when access says so', () => {
        state.access = { state: 'redirect', to: '/projects/training-1/learn' };
        renderPage();

        expect(screen.queryByTestId('file-tree')).not.toBeInTheDocument();
    });

    it('loads the file that was selected in the tree', async () => {
        const user = userEvent.setup();
        renderPage();

        expect(state.useWorkspaceFile).toHaveBeenCalledWith('copy-1', null);

        await selectOrders(user);

        expect(state.useWorkspaceFile).toHaveBeenCalledWith(
            'copy-1',
            'models/orders.yml',
        );
        await waitFor(() =>
            expect(screen.getByTestId('editor')).toHaveAttribute(
                'data-path',
                'models/orders.yml',
            ),
        );
    });

    it('shows a loading placeholder, never the previous file, while switching files', async () => {
        const user = userEvent.setup();
        renderPage();
        await selectOrders(user);
        await waitFor(() =>
            expect(screen.getByTestId('editor')).toHaveAttribute(
                'data-path',
                'models/orders.yml',
            ),
        );

        // dbt_project.yml's query has not answered (the mock's file data is
        // still keyed to orders.yml's path); the editor must show a distinct
        // loading state rather than orders.yml's path/content or the
        // "Pick a file to start" empty state.
        await user.click(
            screen.getByRole('button', { name: 'dbt_project.yml' }),
        );

        await waitFor(() =>
            expect(
                document.querySelector('[data-learn-editor-loading]'),
            ).toBeInTheDocument(),
        );
        expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
        expect(
            screen.queryByText('Pick a file to start'),
        ).not.toBeInTheDocument();
    });

    it('saves the dirty draft before running the command', async () => {
        const user = userEvent.setup();
        renderPage();
        await selectOrders(user);
        await screen.findByTestId('editor');

        await user.type(screen.getByLabelText('Command'), 'dbt parse');
        await user.type(screen.getByLabelText('File'), 'x');
        expect(screen.getByTestId('editor')).toHaveAttribute(
            'data-dirty',
            'true',
        );

        // fireEvent, not userEvent: a real click would blur the editor first,
        // and the blur autosave would hide whether Run itself saves.
        fireEvent.click(screen.getByRole('button', { name: 'Run' }));

        await waitFor(() => expect(state.calls).toEqual(['save', 'run']));
        expect(state.saveMutateAsync).toHaveBeenCalledWith({
            path: 'models/orders.yml',
            content: 'version: 2\nx',
        });
        expect(state.runMutateAsync).toHaveBeenCalledWith({
            tool: 'dbt',
            subcommand: 'parse',
            args: [],
        });
        await waitFor(() =>
            expect(screen.getByTestId('editor')).toHaveAttribute(
                'data-dirty',
                'false',
            ),
        );
    });

    it('attaches to the running command when the server answers 409', async () => {
        const user = userEvent.setup();
        state.runMutateAsync = vi.fn(() =>
            Promise.reject({
                status: 'error',
                error: {
                    name: 'ParameterError',
                    message: `A command is already running (command ${ACTIVE_UUID})`,
                },
            }),
        );
        renderPage();

        await user.type(screen.getByLabelText('Command'), 'dbt parse');
        await user.click(screen.getByRole('button', { name: 'Run' }));

        await waitFor(() =>
            expect(state.useCommandOutput).toHaveBeenCalledWith(
                'copy-1',
                ACTIVE_UUID,
            ),
        );
        expect(screen.getByTestId('terminal-error')).toHaveTextContent('');
    });

    it('shows other run failures in the terminal', async () => {
        const user = userEvent.setup();
        state.runMutateAsync = vi.fn(() =>
            Promise.reject({
                status: 'error',
                error: { name: 'ParameterError', message: 'Sandbox is busy' },
            }),
        );
        renderPage();

        await user.type(screen.getByLabelText('Command'), 'dbt parse');
        await user.click(screen.getByRole('button', { name: 'Run' }));

        await waitFor(() =>
            expect(screen.getByTestId('terminal-error')).toHaveTextContent(
                'Sandbox is busy',
            ),
        );
    });

    it('shows a parse error in the terminal without calling run', async () => {
        const user = userEvent.setup();
        renderPage();

        await user.type(screen.getByLabelText('Command'), 'rm -rf /');
        await user.click(screen.getByRole('button', { name: 'Run' }));

        await waitFor(() =>
            expect(screen.getByTestId('terminal-error')).toHaveTextContent(
                'Commands start with lightdash or dbt',
            ),
        );
        expect(state.runMutateAsync).not.toHaveBeenCalled();
    });

    it('does not run when the save in front of it fails', async () => {
        const user = userEvent.setup();
        state.saveMutateAsync = vi.fn(() =>
            Promise.reject({
                status: 'error',
                error: { name: 'ParameterError', message: 'Read-only file' },
            }),
        );
        renderPage();
        await selectOrders(user);
        await screen.findByTestId('editor');

        await user.type(screen.getByLabelText('Command'), 'dbt parse');
        await user.type(screen.getByLabelText('File'), 'x');
        fireEvent.click(screen.getByRole('button', { name: 'Run' }));

        await waitFor(() =>
            expect(screen.getByTestId('terminal-error')).toHaveTextContent(
                'The file could not be saved, so nothing ran',
            ),
        );
        expect(state.runMutateAsync).not.toHaveBeenCalled();
        expect(screen.getByTestId('editor')).toHaveAttribute(
            'data-dirty',
            'true',
        );
    });

    it('waits on the blur save instead of sending it again when Run follows', async () => {
        const user = userEvent.setup();
        let releaseSave = () => {};
        state.saveMutateAsync = vi.fn(
            () =>
                new Promise<undefined>((resolve) => {
                    releaseSave = () => {
                        state.calls.push('save');
                        resolve(undefined);
                    };
                }),
        );
        renderPage();
        await selectOrders(user);
        await screen.findByTestId('editor');

        await user.type(screen.getByLabelText('Command'), 'dbt parse');
        await user.type(screen.getByLabelText('File'), 'x');
        // Clicking the command input blurs the editor, which starts the save.
        await user.click(screen.getByLabelText('Command'));
        expect(state.saveMutateAsync).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Run' }));
        releaseSave();

        await waitFor(() => expect(state.calls).toEqual(['save', 'run']));
        expect(state.saveMutateAsync).toHaveBeenCalledTimes(1);
    });

    it('stays busy while the attached command has yet to report', async () => {
        const user = userEvent.setup();
        state.pollerAnswered = false;
        renderPage();

        await user.type(screen.getByLabelText('Command'), 'dbt parse');
        await user.click(screen.getByRole('button', { name: 'Run' }));

        await waitFor(() =>
            expect(state.useCommandOutput).toHaveBeenLastCalledWith(
                'copy-1',
                'command-1',
            ),
        );
        expect(screen.getByTestId('terminal')).toHaveAttribute(
            'data-busy',
            'true',
        );
    });

    it('is busy while the save in front of a run is still in flight', () => {
        state.saveIsLoading = true;
        renderPage();

        expect(screen.getByTestId('terminal')).toHaveAttribute(
            'data-busy',
            'true',
        );
    });

    it('drops the cached explores once a lightdash deploy has finished', async () => {
        const user = userEvent.setup();
        const { invalidateQueries } = renderPage();

        await user.type(screen.getByLabelText('Command'), 'lightdash deploy');
        await user.click(screen.getByRole('button', { name: 'Run' }));

        await waitFor(() =>
            expect(invalidateQueries).toHaveBeenCalledWith(['tables']),
        );
    });

    it('leaves the cached explores alone when the finished command was not a deploy', async () => {
        const user = userEvent.setup();
        const { invalidateQueries } = renderPage();

        await user.type(screen.getByLabelText('Command'), 'dbt parse');
        await user.click(screen.getByRole('button', { name: 'Run' }));

        await waitFor(() =>
            expect(screen.getByTestId('terminal-chunks')).toHaveTextContent(
                'command-1 output',
            ),
        );
        expect(invalidateQueries).not.toHaveBeenCalled();
    });

    it('empties the pane of the finished command when the next run is refused', async () => {
        const user = userEvent.setup();
        renderPage();

        await user.type(screen.getByLabelText('Command'), 'dbt parse');
        await user.click(screen.getByRole('button', { name: 'Run' }));
        await waitFor(() =>
            expect(screen.getByTestId('terminal-chunks')).toHaveTextContent(
                'command-1 output',
            ),
        );

        state.runMutateAsync = vi.fn(() =>
            Promise.reject({
                status: 'error',
                error: {
                    name: 'ParameterError',
                    message:
                        'That command is not available in the Learn terminal',
                },
            }),
        );
        await user.clear(screen.getByLabelText('Command'));
        await user.type(screen.getByLabelText('Command'), 'dbt run');
        await user.click(screen.getByRole('button', { name: 'Run' }));

        await waitFor(() =>
            expect(screen.getByTestId('terminal-error')).toHaveTextContent(
                'That command is not available in the Learn terminal',
            ),
        );
        expect(screen.getByTestId('terminal-chunks')).toHaveTextContent('');
        expect(state.useCommandOutput).toHaveBeenLastCalledWith('copy-1', null);
    });

    it('saves on editor blur and keeps the draft when the save fails', async () => {
        const user = userEvent.setup();
        state.saveMutateAsync = vi.fn(() =>
            Promise.reject({
                status: 'error',
                error: { name: 'ParameterError', message: 'Read-only file' },
            }),
        );
        renderPage();
        await selectOrders(user);
        await screen.findByTestId('editor');

        await user.type(screen.getByLabelText('File'), 'x');
        await user.click(screen.getByLabelText('Command'));

        await waitFor(() =>
            expect(state.showToastApiError).toHaveBeenCalledWith({
                title: 'Could not save the file',
                apiError: expect.objectContaining({
                    message: 'Read-only file',
                }),
            }),
        );
        expect(screen.getByTestId('editor')).toHaveAttribute(
            'data-dirty',
            'true',
        );
    });
});
