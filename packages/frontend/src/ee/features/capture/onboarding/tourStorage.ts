/** One flag for every page, so the tour shows once, wherever it is first seen. */
export const VOICE_DESIGN_TOUR_STORAGE_KEY = 'ld.voice-design.tour.v1';

// Each page used to have its own flag; seeing any of them counts.
const OLDER_KEYS = ['dashboard', 'builder', 'app'].map(
    (surface) => `ld.voice-design.${surface}.tour.v1`,
);

export const carryOverOlderTourFlags = (): void => {
    try {
        if (OLDER_KEYS.some((key) => localStorage.getItem(key) === '1')) {
            localStorage.setItem(VOICE_DESIGN_TOUR_STORAGE_KEY, '1');
        }
    } catch {
        // Without storage the tour shows again, which is harmless.
    }
};
