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

        expect(
            container.querySelector('[data-deep-research-control-target]'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Customize homepage' }),
        ).toBeInTheDocument();
    });
});
