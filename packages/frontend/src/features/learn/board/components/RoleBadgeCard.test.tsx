import { ProjectMemberRole, type LearnBadgeTier } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { entry } from '../testFixtures';
import { RoleBadgeCard } from './RoleBadgeCard';

const held = [entry({ id: 'a' }), entry({ id: 'b' })];

const tiers = (map: Record<string, LearnBadgeTier>) =>
    new Map(Object.entries(map));

describe('RoleBadgeCard', () => {
    it('sits at the weakest held module and counts towards the next rung', () => {
        renderWithProviders(
            <RoleBadgeCard
                role={ProjectMemberRole.VIEWER}
                held={held}
                tiers={tiers({ a: 'bronze', b: 'silver' })}
                isLoading={false}
            />,
        );
        expect(screen.getByText('viewer badge')).toBeInTheDocument();
        // The rung word also appears in the disclosure, so pin the hero span.
        expect(
            screen.getByText('Bronze', { selector: 'span' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Pass every quiz for silver/),
        ).toBeInTheDocument();
        expect(screen.getByText(/1 of 2 there/)).toBeInTheDocument();
    });

    it('says so when every held module is at the top rung', () => {
        renderWithProviders(
            <RoleBadgeCard
                role={ProjectMemberRole.EDITOR}
                held={held}
                tiers={tiers({ a: 'violet', b: 'violet' })}
                isLoading={false}
            />,
        );
        expect(screen.getByText('editor badge')).toBeInTheDocument();
        expect(screen.getByText('All 2 modules at violet')).toBeInTheDocument();
    });

    it('lists the four rungs in the How badges work disclosure', () => {
        renderWithProviders(
            <RoleBadgeCard
                role={ProjectMemberRole.VIEWER}
                held={held}
                tiers={tiers({})}
                isLoading={false}
            />,
        );
        expect(screen.getByText('How badges work')).toBeInTheDocument();
        expect(screen.getByText('Finish every module')).toBeInTheDocument();
        expect(screen.getByText('Pass every quiz')).toBeInTheDocument();
        expect(
            screen.getByText('Score 90% or more on every quiz'),
        ).toBeInTheDocument();
        expect(screen.getByText('Ace every quiz (100%)')).toBeInTheDocument();
    });

    it('waits rather than calling a pending fetch unavailable', () => {
        renderWithProviders(
            <RoleBadgeCard
                role={ProjectMemberRole.VIEWER}
                held={held}
                tiers={null}
                isLoading
            />,
        );
        expect(screen.getByText('Loading badges')).toBeInTheDocument();
        expect(
            screen.queryByText('Badges unavailable right now'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('Locked', { selector: 'span' }),
        ).not.toBeInTheDocument();
    });

    it('says badges could not be loaded rather than reading as revoked', () => {
        renderWithProviders(
            <RoleBadgeCard
                role={ProjectMemberRole.VIEWER}
                held={held}
                tiers={null}
                isLoading={false}
            />,
        );
        expect(
            screen.getByText('Badges unavailable right now'),
        ).toBeInTheDocument();
        expect(screen.getByText('viewer badge')).toBeInTheDocument();
    });

    it('renders nothing when the role holds no modules', () => {
        renderWithProviders(
            <div data-testid="mount">
                <RoleBadgeCard
                    role={ProjectMemberRole.VIEWER}
                    held={[]}
                    tiers={tiers({})}
                    isLoading={false}
                />
            </div>,
        );
        expect(screen.getByTestId('mount')).toBeEmptyDOMElement();
    });
});
