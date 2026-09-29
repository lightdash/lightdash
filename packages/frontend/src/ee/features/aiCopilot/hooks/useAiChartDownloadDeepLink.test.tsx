import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { useAiChartDownloadDeepLink } from './useAiChartDownloadDeepLink';

const artifact = { artifactUuid: 'artifact-1', versionUuid: 'version-1' };
const path =
    '/threads/thread-1?other=kept&downloadArtifactUuid=artifact-1&downloadVersionUuid=version-1';

const Harness = ({
    canDownloadResults,
    isDisabled = false,
    openDownloadModal,
    versionUuid = artifact.versionUuid,
}: {
    canDownloadResults: boolean;
    isDisabled?: boolean;
    openDownloadModal: () => void;
    versionUuid?: string;
}) => {
    useAiChartDownloadDeepLink({
        allowDownloadDeepLink: true,
        canDownloadResults,
        isDisabled,
        artifact: { ...artifact, versionUuid },
        openDownloadModal,
    });
    const location = useLocation();
    return <span data-testid="location">{location.search}</span>;
};

describe('useAiChartDownloadDeepLink', () => {
    it('opens the export dialog for the exact artifact and removes only its link parameters', () => {
        const openDownloadModal = vi.fn();
        render(
            <MemoryRouter initialEntries={[path]}>
                <Harness
                    canDownloadResults
                    openDownloadModal={openDownloadModal}
                />
            </MemoryRouter>,
        );

        expect(openDownloadModal).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('location').textContent).toBe('?other=kept');
    });

    it('keeps the link pending until the artifact is ready', () => {
        const openDownloadModal = vi.fn();
        const { rerender } = render(
            <MemoryRouter initialEntries={[path]}>
                <Harness
                    canDownloadResults
                    isDisabled
                    openDownloadModal={openDownloadModal}
                />
            </MemoryRouter>,
        );
        expect(openDownloadModal).not.toHaveBeenCalled();

        rerender(
            <MemoryRouter initialEntries={[path]}>
                <Harness
                    canDownloadResults
                    openDownloadModal={openDownloadModal}
                />
            </MemoryRouter>,
        );
        expect(openDownloadModal).toHaveBeenCalledTimes(1);
    });

    it('does not open without CSV export permission or for another version', () => {
        const openDownloadModal = vi.fn();
        const { rerender } = render(
            <MemoryRouter initialEntries={[path]}>
                <Harness
                    canDownloadResults={false}
                    openDownloadModal={openDownloadModal}
                />
            </MemoryRouter>,
        );
        expect(openDownloadModal).not.toHaveBeenCalled();
        expect(screen.getByTestId('location').textContent).toContain(
            'downloadArtifactUuid=artifact-1',
        );

        rerender(
            <MemoryRouter initialEntries={[path]}>
                <Harness
                    canDownloadResults
                    versionUuid="another-version"
                    openDownloadModal={openDownloadModal}
                />
            </MemoryRouter>,
        );
        expect(openDownloadModal).not.toHaveBeenCalled();
    });
});
