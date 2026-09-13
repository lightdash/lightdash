import type { LearnCommandOutputChunk } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Terminal, { type TerminalOutput } from './Terminal';

const EMPTY_OUTPUT: TerminalOutput = {
    status: null,
    exitCode: null,
    startedAt: null,
    finishedAt: null,
    chunks: [],
    error: null,
    isActive: false,
};

type RenderOverrides = {
    value?: string;
    onValueChange?: (value: string) => void;
    onRun?: () => void;
    running?: boolean;
    disabled?: boolean;
    output?: Partial<TerminalOutput>;
    commandSuggestion?: string;
};

const renderTerminal = (overrides: RenderOverrides = {}) => {
    const onValueChange = overrides.onValueChange ?? vi.fn();
    const onRun = overrides.onRun ?? vi.fn();
    render(
        <MantineProvider env="test">
            <Terminal
                value={overrides.value ?? ''}
                onValueChange={onValueChange}
                onRun={onRun}
                running={overrides.running ?? false}
                disabled={overrides.disabled ?? false}
                output={{ ...EMPTY_OUTPUT, ...overrides.output }}
                commandSuggestion={overrides.commandSuggestion}
            />
        </MantineProvider>,
    );
    return { onValueChange, onRun };
};

describe('Terminal', () => {
    it('renders chunks in seq order with data-stream', () => {
        const chunks: LearnCommandOutputChunk[] = [
            { seq: 1, stream: 'stdout', text: 'Parsing project…' },
            { seq: 2, stream: 'stderr', text: 'warning: deprecated' },
            { seq: 3, stream: 'stdout', text: 'Done.' },
        ];
        renderTerminal({ output: { chunks } });

        const lines = screen
            .getAllByText(/Parsing project…|warning: deprecated|Done\./)
            .map((el) => el.textContent);
        expect(lines).toEqual([
            'Parsing project…',
            'warning: deprecated',
            'Done.',
        ]);

        expect(screen.getByText('warning: deprecated')).toHaveAttribute(
            'data-stream',
            'stderr',
        );
        expect(screen.getByText('Parsing project…')).toHaveAttribute(
            'data-stream',
            'stdout',
        );
    });

    it('shows data-tour-busy="true" and status Running while running, removing it when done', () => {
        const { rerender } = render(
            <MantineProvider env="test">
                <Terminal
                    value=""
                    onValueChange={vi.fn()}
                    onRun={vi.fn()}
                    running
                    disabled={false}
                    output={{
                        ...EMPTY_OUTPUT,
                        status: 'running',
                        startedAt: '2026-01-01T00:00:00.000Z',
                    }}
                />
            </MantineProvider>,
        );

        const outputRoot = document.querySelector(
            '[data-learn-terminal-output]',
        );
        expect(outputRoot).toHaveAttribute('data-tour-busy', 'true');
        expect(screen.getByText('Running')).toHaveAttribute(
            'data-tour-status',
            'true',
        );

        rerender(
            <MantineProvider env="test">
                <Terminal
                    value=""
                    onValueChange={vi.fn()}
                    onRun={vi.fn()}
                    running={false}
                    disabled={false}
                    output={{
                        ...EMPTY_OUTPUT,
                        status: 'done',
                        exitCode: 0,
                        startedAt: '2026-01-01T00:00:00.000Z',
                        finishedAt: '2026-01-01T00:00:08.000Z',
                    }}
                />
            </MantineProvider>,
        );

        expect(outputRoot).not.toHaveAttribute('data-tour-busy');
        expect(screen.getByText('Finished · 8s')).toBeInTheDocument();
    });

    it('disables the Run button while running', () => {
        renderTerminal({ running: true });

        expect(screen.getByRole('button', { name: /run/i })).toBeDisabled();
    });

    it('has an accessible name for the command input', () => {
        renderTerminal({ value: 'dbt parse' });

        expect(screen.getByLabelText('Command')).toHaveValue('dbt parse');
    });

    it('calls onRun when Enter is pressed in the command input', async () => {
        const { onRun } = renderTerminal({ value: 'dbt parse' });

        await userEvent.click(screen.getByLabelText('Command'));
        await userEvent.keyboard('{Enter}');

        expect(onRun).toHaveBeenCalledTimes(1);
    });

    it('does not call onRun on Enter, and disables Run, when the command is blank or whitespace', async () => {
        const { onRun } = renderTerminal({ value: '   ' });

        expect(screen.getByRole('button', { name: /run/i })).toBeDisabled();

        await userEvent.click(screen.getByLabelText('Command'));
        await userEvent.keyboard('{Enter}');

        expect(onRun).not.toHaveBeenCalled();
    });

    it('renders output.error as a visible line', () => {
        renderTerminal({
            output: { error: 'Could not read the command output' },
        });

        expect(
            screen.getByText('Could not read the command output'),
        ).toBeInTheDocument();
    });

    it('sets the value when a quick command chip is clicked', async () => {
        const { onValueChange } = renderTerminal();

        await userEvent.click(
            screen.getByRole('button', { name: 'dbt parse' }),
        );

        expect(onValueChange).toHaveBeenCalledWith('dbt parse');
    });

    it('disables the quick command chips while running', () => {
        renderTerminal({ running: true });

        expect(
            screen.getByRole('button', { name: 'dbt parse' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'lightdash compile' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'lightdash deploy' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'lightdash validate' }),
        ).toBeDisabled();
    });

    it('shows the empty-state message in the status footer before anything has run', () => {
        renderTerminal();

        expect(
            screen.getByText('Run a command to see its output here'),
        ).toHaveAttribute('data-tour-status', 'true');
    });

    it('shows Failed with no exit suffix when exitCode is null', () => {
        renderTerminal({ output: { status: 'error', exitCode: null } });

        expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('shows Failed (exit N) when exitCode is present', () => {
        renderTerminal({ output: { status: 'error', exitCode: 1 } });

        expect(screen.getByText('Failed (exit 1)')).toBeInTheDocument();
    });
});
