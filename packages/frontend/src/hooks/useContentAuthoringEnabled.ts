import { useIsPhoneDevice } from './useIsPhoneDevice';

/** Phones support viewing and filtering, but not chart/dashboard authoring. */
export const useContentAuthoringEnabled = () => !useIsPhoneDevice();
