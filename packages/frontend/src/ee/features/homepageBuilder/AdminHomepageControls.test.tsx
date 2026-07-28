import { render, screen } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminHomepageControls } from './AdminHomepageControls';

vi.mock('react-router', () => ({
    useNavigate: () => vi.fn(),
}));

vi.mock('../../../providers/Ability', () => ({
    Can: ({ children }: PropsWithChildren) => children,
}));

describe('AdminHomepageControls', () => {
    it('provides a Deep Research target beside the homepage controls', () => {
        const { container } = render(
            <AdminHomepageControls
                projectUuid="project-1"
                organizationUuid="organization-1"
            />,
        );

        const customizeButton = screen.getByRole('button', {
            name: 'Customize homepage',
        });
        const deepResearchTarget = container.querySelector(
            '[data-deep-research-control-target]',
        );

        expect(deepResearchTarget).toBeInTheDocument();
        if (!deepResearchTarget) {
            throw new Error('Deep Research target was not rendered');
        }
        expect(
            customizeButton.compareDocumentPosition(deepResearchTarget),
        ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });
});
