import { useMatches } from '@mantine/core';

/** Phone layouts support viewing and filtering, not chart/dashboard authoring. */
export const useContentAuthoringEnabled = () =>
    useMatches({ base: false, sm: true }, { getInitialValueInEffect: false });
