import { MantineProvider } from '@mantine/core';
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
    file: { data: undefined } as {
        data: { path: string; content: string; editable: boolean } | undefined;
    },
    saveIsLoading: false,
    runIsLoading: false,
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
    useWorkspaceFiles: () => ({ data: state.files }),
}));

vi.mock('./hooks/useWorkspaceFile', () => ({
    useWorkspaceFile: (projectUuid: string, path: string | null) => {
        state.useWorkspaceFile(projectUuid, path);
        return path ? state.file : { data: undefined };
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

vi.mock('./hooks/useCommandOutput', () => ({
    useCommandOutput: (projectUuid: string, commandUuid: string | null) => {
        state.useCommandOutput(projectUuid, commandUuid);
        return {
            status: null,
            exitCode: null,
            startedAt: null,
            finishedAt: null,
            chunks: [],
            error: null,
            isActive: false,
        };
    },
}));

// jsdom has no layout, so every resize handle's rect is 0×0 at the origin and
// react-resizable-panels reads every pointerdown at (0,0) as a drag on a
// handle and calls stopPropagation on it — no click in the page would ever
// land. The split layout is not what this page's test is about.
vi.mock('react-resizable-panels', () => ({
    PanelGroup: ({ children }: PropsWithChildren) => <div>{children}</div>,
    Panel: ({ children }: PropsWithChildren) => <div>{children}</div>,
    PanelResizeHandle: () => <div />,
}));

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
        running,
        disabled,
        output,
    }: {
        value: string;
        onValueChange: (value: string) => void;
        onRun: () => void;
        running: boolean;
        disabled: boolean;
        output: { error: string | null };
    }) => (
        <div
            data-testid="terminal"
            data-running={String(running)}
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
        </div>
    ),
}));

import LearnWorkspacePage from './LearnWorkspacePage';

const renderPage = () =>
    render(
        <MemoryRouter initialEntries={['/projects/copy-1/learn/workspace']}>
            <MantineProvider env="test">
                <LearnWorkspacePage />
            </MantineProvider>
        </MemoryRouter>,
    );

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
        state.file = { data: undefined };
        state.saveIsLoading = false;
        state.runIsLoading = false;
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
