import {
    type HomepageCtaBlock,
    type HomepageCtaTarget,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CtaBlockView } from './CtaBlock';

vi.mock('../../../../hooks/appearance/useProjectColorPalette', () => ({
    useProjectColorPalette: () => ({ data: undefined }),
}));
vi.mock('../../../../hooks/organization/useOrganizationBrand', () => ({
    useOrganizationBrand: () => ({ data: undefined }),
}));
vi.mock('../../../../hooks/useProjectRoute', () => ({
    useProjectUrlIdentifier: () => 'p1',
}));
vi.mock('../../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));
vi.mock('../hooks/useHomepageAiState', () => ({
    useHomepageAiState: () => ({ canAskAi: true }),
}));
vi.mock('../hooks/useRuntimeEmptyBlocks', () => ({
    useReportRuntimeEmpty: vi.fn(),
}));

const block = (target: HomepageCtaTarget): HomepageCtaBlock => ({
    id: 'b1',
    type: 'cta',
    config: { buttonLabel: 'Go', target },
});

const renderCta = (target: HomepageCtaTarget) =>
    render(
        <MantineProvider env="test">
            <MemoryRouter>
                <CtaBlockView
                    block={block(target)}
                    projectUuid="p1"
                    itemSpan={null}
                />
            </MemoryRouter>
        </MantineProvider>,
    );

describe('CtaBlockView links', () => {
    it('opens external custom links in a new tab', () => {
        renderCta({ type: 'link', url: 'https://example.com/survey' });
        const link = screen.getByRole('link');
        expect(link).toHaveAttribute('href', 'https://example.com/survey');
        expect(link).toHaveAttribute('target', '_blank');
    });

    it('navigates same-origin custom links in-app', () => {
        renderCta({
            type: 'link',
            url: `${window.location.origin}/projects/p1/spaces/s1`,
        });
        const link = screen.getByRole('link');
        expect(link).toHaveAttribute('href', '/projects/p1/spaces/s1');
        expect(link).not.toHaveAttribute('target');
    });

    it('navigates a space target in-app', () => {
        renderCta({ type: 'space', spaceUuid: 's1', label: 'Finance' });
        const link = screen.getByRole('link');
        expect(link).toHaveAttribute('href', '/projects/p1/spaces/s1');
        expect(link).not.toHaveAttribute('target');
    });
});
