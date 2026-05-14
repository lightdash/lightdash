import useApp from '../../providers/App/useApp';

/**
 * Origin where data-app preview iframes load. Falls back to the current
 * page's origin when no preview origin is configured (dev / pre-cutover) so
 * previews continue to render same-origin.
 */
export const usePreviewOrigin = (): string => {
    const { health } = useApp();
    return health.data?.dataApps.previewOrigin ?? window.location.origin;
};
