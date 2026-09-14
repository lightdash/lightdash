import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import BuilderPromptExamples from './BuilderPromptExamples';

vi.mock('../../../hooks/appearance/useOrganizationAppearance', () => ({
    useColorPalettes: () => ({ data: [] }),
}));
vi.mock('../../../hooks/appearance/useProjectColorPalette', () => ({
    useProjectColorPalette: () => ({
        data: { colors: ['#112233', '#445566', '#778899', '#aabbcc'] },
    }),
}));

describe('BuilderPromptExamples', () => {
    it('offers short starter prompts', () => {
        renderWithProviders(
            <BuilderPromptExamples projectUuid="p1" onPick={vi.fn()} />,
        );

        expect(
            screen.getByText('A stream graph of share over time'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('A funnel of signup steps'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('A calendar heatmap of daily orders'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('A waterfall of revenue changes'),
        ).toBeInTheDocument();
    });

    it('hands the picked prompt back to the composer', async () => {
        const onPick = vi.fn();
        renderWithProviders(
            <BuilderPromptExamples projectUuid="p1" onPick={onPick} />,
        );

        await userEvent.click(screen.getByText('A funnel of signup steps'));

        expect(onPick).toHaveBeenCalledWith('A funnel of signup steps');
    });

    it('previews the examples in the project palette', () => {
        renderWithProviders(
            <BuilderPromptExamples projectUuid="p1" onPick={vi.fn()} />,
        );

        const card = screen
            .getByText('A funnel of signup steps')
            .closest('button');
        const fills = Array.from(card?.querySelectorAll('[fill]') ?? []).map(
            (el) => el.getAttribute('fill'),
        );

        expect(fills).toEqual(['#112233', '#445566', '#778899', '#aabbcc']);
    });
});
