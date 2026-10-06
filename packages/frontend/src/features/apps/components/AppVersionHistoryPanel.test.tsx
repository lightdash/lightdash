import { type ApiAppVersionSummary } from '@lightdash/common';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { appVersion } from '../testing/appVersionHistory';
import AppVersionHistoryPanel from './AppVersionHistoryPanel';

const lightdashApi = vi.hoisted(() => vi.fn());

vi.mock('../../../api', () => ({ lightdashApi }));

const entry = (
    version: number,
    threadNumber: number,
    prompt = `prompt ${version}`,
): ApiAppVersionSummary => ({
    ...appVersion({ version, prompt }),
    threadUuid: `thread-${threadNumber}`,
    threadNumber,
});

const defaultProps = {
    latestReadyVersion: 3 as number | null,
    viewedVersion: null as number | null,
    onView: vi.fn(),
    onRestore: vi.fn(),
    onClose: null,
    onBack: null,
    liveBuild: null,
    hasEarlier: false,
    isFetchingEarlier: false,
    fetchEarlier: vi.fn(),
    emptyPromptLabel: null,
    olderVersionTime: 'relative' as const,
    currentThreadNumber: null as number | null,
    thumbnailSource: null,
};

describe('AppVersionHistoryPanel', () => {
    it('separates thread groups with a divider, newest thread first', () => {
        renderWithProviders(
            <AppVersionHistoryPanel
                {...defaultProps}
                versions={[entry(1, 1), entry(3, 2), entry(2, 1)]}
            />,
        );

        const labels = screen.getAllByText(/^v\d+$/);
        expect(labels.map((l) => l.textContent)).toEqual(['v3', 'v2', 'v1']);
        expect(screen.getAllByText('Agent context cleared')).toHaveLength(1);
    });

    it('tops the list with a divider when the current thread has no versions yet', () => {
        renderWithProviders(
            <AppVersionHistoryPanel
                {...defaultProps}
                versions={[entry(2, 1), entry(1, 1)]}
                currentThreadNumber={2}
            />,
        );

        const list = screen.getByLabelText('Version history');
        const divider = screen.getByText('Agent context cleared');
        const firstVersion = screen.getByText('v2');
        expect(
            divider.compareDocumentPosition(firstVersion) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(list).toContainElement(divider);
    });

    it('renders no divider for a single thread', () => {
        renderWithProviders(
            <AppVersionHistoryPanel
                {...defaultProps}
                versions={[entry(3, 1), entry(2, 1), entry(1, 1)]}
                currentThreadNumber={1}
            />,
        );

        expect(
            screen.queryByText('Agent context cleared'),
        ).not.toBeInTheDocument();
    });

    it('renders an empty prompt empty when no stand-in label is given', () => {
        renderWithProviders(
            <AppVersionHistoryPanel
                {...defaultProps}
                versions={[entry(3, 1, ''), entry(2, 1)]}
            />,
        );

        expect(screen.getByText('prompt 2')).toBeInTheDocument();
        expect(
            screen.queryByText('Uploaded from source'),
        ).not.toBeInTheDocument();
    });

    it('offers Preview and Restore only on ready versions', () => {
        renderWithProviders(
            <AppVersionHistoryPanel
                {...defaultProps}
                versions={[
                    entry(3, 1),
                    { ...entry(2, 1), status: 'error' },
                    entry(1, 1),
                ]}
            />,
        );

        expect(screen.getAllByText('Preview')).toHaveLength(1);
        expect(screen.getAllByText('Restore')).toHaveLength(1);
    });

    it('shows the author under each prompt, skipping deleted users', () => {
        renderWithProviders(
            <AppVersionHistoryPanel
                {...defaultProps}
                versions={[
                    entry(3, 1),
                    {
                        ...entry(2, 1),
                        createdByUser: {
                            userUuid: 'u2',
                            firstName: 'Tom',
                            lastName: 'Weller',
                        },
                    },
                    { ...entry(1, 1), createdByUser: null },
                ]}
            />,
        );

        expect(screen.getAllByText('Katie Jones')).toHaveLength(1);
        expect(screen.getByText('KJ')).toBeInTheDocument();
        expect(screen.getByText('Tom Weller')).toBeInTheDocument();
        expect(screen.getByText('TW')).toBeInTheDocument();
        expect(screen.getAllByText(/^[A-Z]{2}$/)).toHaveLength(2);
    });

    it('shows an empty state with no versions', () => {
        renderWithProviders(
            <AppVersionHistoryPanel
                {...defaultProps}
                versions={[]}
                latestReadyVersion={null}
            />,
        );

        expect(screen.getByText('No versions yet')).toBeInTheDocument();
    });
});

describe('AppVersionHistoryPanel thumbnails', () => {
    const observed = new Map<Element, IntersectionObserverCallback>();
    const thumbnailSource = { projectUuid: 'project-1', appUuid: 'app-1' };

    beforeEach(() => {
        observed.clear();
        vi.stubGlobal(
            'IntersectionObserver',
            vi.fn(function (callback: IntersectionObserverCallback) {
                const targets: Element[] = [];
                return {
                    observe: (element: Element) => {
                        targets.push(element);
                        observed.set(element, callback);
                    },
                    disconnect: () =>
                        targets.forEach((element) => observed.delete(element)),
                };
            }),
        );
        lightdashApi.mockReset();
        lightdashApi.mockImplementation(async ({ url }: { url: string }) => ({
            thumbnailUrl: `https://storage.test${url}.png`,
        }));
    });

    afterEach(() => vi.unstubAllGlobals());

    /** Brings the row of one version on screen. */
    const scrollToVersion = (version: number) => {
        const row = screen.getByText(`v${version}`).closest('li');
        expect(row).not.toBeNull();
        act(() => {
            [...observed].forEach(([target, callback]) => {
                if (!row!.contains(target)) return;
                callback(
                    [{ target, isIntersecting: true }] as never,
                    {} as IntersectionObserver,
                );
            });
        });
    };

    const withThumbnail = (version: number): ApiAppVersionSummary => ({
        ...entry(version, 1),
        hasThumbnail: true,
    });

    const thumbnails = () =>
        screen.queryAllByRole('img', { name: /^Thumbnail of v\d+$/ });

    it('shows the thumbnail of a ready version once its row is on screen', async () => {
        renderWithProviders(
            <AppVersionHistoryPanel
                {...defaultProps}
                thumbnailSource={thumbnailSource}
                versions={[withThumbnail(3), withThumbnail(2), entry(1, 1)]}
            />,
        );

        expect(thumbnails()).toHaveLength(0);
        expect(lightdashApi).not.toHaveBeenCalled();

        scrollToVersion(3);

        const image = await screen.findByRole('img', {
            name: 'Thumbnail of v3',
        });
        expect(image).toHaveAttribute(
            'src',
            'https://storage.test/ee/projects/project-1/apps/app-1/versions/3/thumbnail.png',
        );
        // v2 has a thumbnail too, but its row is still off screen.
        expect(thumbnails()).toHaveLength(1);
        expect(lightdashApi).toHaveBeenCalledOnce();
    });

    it('shows nothing on versions without a thumbnail, wherever they are', async () => {
        renderWithProviders(
            <AppVersionHistoryPanel
                {...defaultProps}
                latestReadyVersion={4}
                thumbnailSource={thumbnailSource}
                versions={[
                    { ...entry(5, 1), status: 'building' },
                    withThumbnail(4),
                    { ...entry(3, 1), status: 'error' },
                    entry(2, 1),
                ]}
            />,
        );

        [5, 4, 3, 2].forEach(scrollToVersion);

        await screen.findByRole('img', { name: 'Thumbnail of v4' });
        expect(thumbnails()).toHaveLength(1);
        expect(lightdashApi).toHaveBeenCalledOnce();
        expect(
            screen.getAllByRole('button', { name: /^View v\d+$/ }),
        ).toHaveLength(1);
    });

    it('views the version when its thumbnail is clicked, like Preview', async () => {
        const onView = vi.fn();
        renderWithProviders(
            <AppVersionHistoryPanel
                {...defaultProps}
                onView={onView}
                thumbnailSource={thumbnailSource}
                versions={[entry(3, 1), withThumbnail(2)]}
            />,
        );
        scrollToVersion(2);

        await userEvent.click(
            await screen.findByRole('button', { name: 'View v2' }),
        );

        expect(onView).toHaveBeenCalledExactlyOnceWith(2);
    });

    it('shows no image when the thumbnail cannot be read', async () => {
        lightdashApi.mockRejectedValue(new Error('Forbidden'));
        renderWithProviders(
            <AppVersionHistoryPanel
                {...defaultProps}
                thumbnailSource={thumbnailSource}
                versions={[withThumbnail(3)]}
            />,
        );

        scrollToVersion(3);

        await vi.waitFor(() => expect(lightdashApi).toHaveBeenCalledOnce());
        expect(thumbnails()).toHaveLength(0);
    });

    it('shows no thumbnails in a host that has none', () => {
        renderWithProviders(
            <AppVersionHistoryPanel
                {...defaultProps}
                thumbnailSource={null}
                versions={[withThumbnail(3)]}
            />,
        );

        scrollToVersion(3);

        expect(thumbnails()).toHaveLength(0);
        expect(lightdashApi).not.toHaveBeenCalled();
    });
});
