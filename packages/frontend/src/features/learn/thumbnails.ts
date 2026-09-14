/**
 * A screenshot per module for the card's band, taken by the walkthrough
 * smoke (`pnpm scope-tours:smoke --thumbnails`) at the moment the learner
 * acts, and committed under ./thumbnails/<scope>.jpg. A
 * module without one shows its band alone.
 */
const files = import.meta.glob<string>('./thumbnails/*.jpg', {
    eager: true,
    import: 'default',
});

export const thumbnailFor = (scope: string): string | undefined =>
    files[`./thumbnails/${scope.replace(/[^A-Za-z0-9]/g, '_')}.jpg`];
