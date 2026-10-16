import { type GuidedTourStep } from '../../../../../../components/common/GuidedTour';
import i18n from '../../../../../../i18n/i18n';

// Getters resolve copy lazily, after i18n init and in the current language
export const MEMORY_TOUR_STEPS: GuidedTourStep[] = [
    {
        target: '[data-tour="memories-header-button"]',
        get title() {
            return i18n.t('memoryTour.rememberTitle', { ns: 'aiAgent' });
        },
        get body() {
            return i18n.t('memoryTour.rememberBody', { ns: 'aiAgent' });
        },
    },
    {
        target: '[data-tour="my-memories-modal"]',
        get title() {
            return i18n.t('memoryTour.reviewTitle', { ns: 'aiAgent' });
        },
        get body() {
            return i18n.t('memoryTour.reviewBody', { ns: 'aiAgent' });
        },
    },
];
