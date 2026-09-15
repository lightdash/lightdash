import { isMobileOnly } from 'react-device-detect';

/**
 * A device hint for phone-only product restrictions.
 *
 * Never use this for layout, styling, navigation, or routing. Those must remain
 * responsive to available width through media or container queries.
 */
export const useIsPhoneDevice = () => isMobileOnly;
