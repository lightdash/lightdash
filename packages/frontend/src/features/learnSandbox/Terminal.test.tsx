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
    busy?: boolean;
    disabled?: boolean;
    output?: Partial<TerminalOutput>;
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
                busy={overrides.busy ?? false}
                disabled={overrides.disabled ?? false}
                output={{ ...EMPTY_OUTPUT, ...overrides.output }}
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

    it('shows data-tour-busy="true" and status Running while busy, removing it when done', () => {
        const { rerender } = render(
            <MantineProvider env="test">
                <Terminal
                    value=""
                    onValueChange={vi.fn()}
                    onRun={vi.fn()}
                    busy
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
        expect(outputRoot).toHaveAttribute(
            'data-tour-anchor',
            'terminal-running',
        );
        expect(outputRoot).toHaveAttribute(
            'data-tour-hint',
            'Wait for the command to finish',
        );
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
                    busy={false}
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
        expect(outputRoot).not.toHaveAttribute('data-tour-anchor');
        expect(screen.getByText('Finished · 8s')).toBeInTheDocument();
    });

    it('is busy for the tour from the moment Run is clicked, before the first poll', () => {
        renderTerminal({ busy: true });

        const pane = document.querySelector('[data-learn-terminal-output]');
        expect(pane).toHaveAttribute('data-tour-busy', 'true');
        expect(pane).toHaveAttribute('data-tour-anchor', 'terminal-running');
    });

    it('disables the Run button while busy', () => {
        renderTerminal({ busy: true });

        expect(screen.getByRole('button', { name: /run/i })).toBeDisabled();
    });

    it('disables Run and says why for a command the terminal would refuse', () => {
        renderTerminal({ value: 'lightdash depl' });
        const run = document.querySelector(
            '[data-tour-anchor="terminal-run"]',
        ) as HTMLButtonElement;
        expect(run).toBeDisabled();
        expect(run).toHaveAttribute(
            'title',
            'That command is not available in the Learn terminal',
        );
    });

    it('marks the command input as exact, so a walkthrough advances only on the suggested command', () => {
        renderTerminal();
        expect(screen.getByLabelText('Command')).toHaveAttribute(
            'data-tour-exact',
            'true',
        );
    });

    it('marks a failed or timed-out run for the tour, and nothing else', () => {
        const pane = () =>
            document.querySelector('[data-learn-terminal-output]')!;
        renderTerminal({ output: { status: 'error', exitCode: 1 } });
        expect(pane().getAttribute('data-tour-failed')).toBe('true');
    });

    it('does not mark a finished or running command as failed', () => {
        renderTerminal({ output: { status: 'done', exitCode: 0 } });
        expect(
            document
                .querySelector('[data-learn-terminal-output]')!
                .hasAttribute('data-tour-failed'),
        ).toBe(false);
    });

    it('has an accessible name for the command input', () => {
        renderTerminal({ value: 'dbt parse' });

        expect(screen.getByLabelText('Command')).toHaveValue('dbt parse');
    });

    it('renders a static data-tour-suggest on the command input', () => {
        renderTerminal();

        expect(screen.getByLabelText('Command')).toHaveAttribute(
            'data-tour-suggest',
            'dbt parse',
        );
    });

    it('never disables the command input, even while a save is in flight', () => {
        renderTerminal({ disabled: true });

        expect(screen.getByLabelText('Command')).toBeEnabled();
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

    it('disables the quick command chips while busy', () => {
        renderTerminal({ busy: true });

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

    it('shows the empty-state message in the output body, not the status footer, before anything has run', () => {
        renderTerminal();

        const emptyMessage = screen.getByText(
            'Run a command to see its output here',
        );
        expect(emptyMessage).not.toHaveAttribute('data-tour-status');
        expect(document.querySelector('[data-tour-status]')).toHaveTextContent(
            '',
        );
    });

    it('hides the empty-state message and leaves data-tour-status empty when output.error is set', () => {
        renderTerminal({ output: { error: 'Could not save the file' } });

        expect(
            screen.queryByText('Run a command to see its output here'),
        ).not.toBeInTheDocument();
        expect(document.querySelector('[data-tour-status]')).toHaveTextContent(
            '',
        );
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
