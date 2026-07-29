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
    it('only renders homepage curation controls', () => {
        const { container } = render(
            <AdminHomepageControls
                projectUuid="project-1"
                organizationUuid="organization-1"
            />,
        );

        const customizeButton = screen.getByRole('button', {
            name: 'Customize homepage',
        });

        expect(customizeButton).toBeInTheDocument();
        expect(container).not.toHaveTextContent('Deep research');
        expect(
            container.querySelector('[data-deep-research-control-target]'),
        ).not.toBeInTheDocument();
    });
});
