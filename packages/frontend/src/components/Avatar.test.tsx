import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../testing/testUtils';
import { LightdashUserAvatar } from './Avatar';

const UUID_A = 'b264d83a-9000-426a-85ec-3f9c20f368ce';

describe('LightdashUserAvatar', () => {
    it('falls back to the legacy plain avatar with a userUuid but no gradient or photo', () => {
        renderWithProviders(
            <LightdashUserAvatar userUuid={UUID_A} name="Ada Lovelace" />,
        );
        expect(
            document.querySelector('[data-avatar-gradient]'),
        ).not.toBeInTheDocument();
        expect(screen.getByText('AL')).toBeInTheDocument();
    });

    it('prefers the explicit gradient override', () => {
        renderWithProviders(
            <LightdashUserAvatar
                userUuid={UUID_A}
                avatarGradient="lilac"
                name="Ada Lovelace"
            />,
        );
        expect(
            document.querySelector('[data-avatar-gradient="lilac"]'),
        ).toBeInTheDocument();
    });

    it('renders the image when avatarUrl is set', () => {
        renderWithProviders(
            <LightdashUserAvatar
                userUuid={UUID_A}
                avatarUrl="/api/v1/users/x/avatar/abc"
                name="Ada Lovelace"
            />,
        );
        expect(document.querySelector('img')).toHaveAttribute(
            'src',
            '/api/v1/users/x/avatar/abc',
        );
    });

    it('renders the mesh branch for a vibe-encoded mesh value', () => {
        renderWithProviders(
            <LightdashUserAvatar
                userUuid={UUID_A}
                avatarGradient="mesh:2:#5e4cff"
                name="Ada Lovelace"
            />,
        );
        expect(
            document.querySelector('[data-avatar-gradient="custom"]'),
        ).toBeInTheDocument();
        expect(
            document.querySelector('.avatar-mesh-2-5e4cff'),
        ).toBeInTheDocument();
    });

    it('falls back to the plain avatar for a malformed mesh value', () => {
        renderWithProviders(
            <LightdashUserAvatar
                userUuid={UUID_A}
                avatarGradient="mesh:9:#5e4cff"
                name="Ada Lovelace"
            />,
        );
        expect(
            document.querySelector('[data-avatar-gradient]'),
        ).not.toBeInTheDocument();
    });

    it('keeps legacy color-initials behavior without a userUuid', () => {
        renderWithProviders(<LightdashUserAvatar name="Ada Lovelace" />);
        expect(
            document.querySelector('[data-avatar-gradient]'),
        ).not.toBeInTheDocument();
    });
});
