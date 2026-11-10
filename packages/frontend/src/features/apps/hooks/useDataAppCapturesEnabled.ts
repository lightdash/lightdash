import { useOrganization } from '../../../hooks/organization/useOrganization';

/**
 * The organization's effective "allow screenshots and attachments in data app
 * builds" switch, read from `GET /org` so every member sees it. When false the
 * builder hides its capture affordances: the prompt-bar screenshot button,
 * file attachments, "Capture thumbnail" and the move-to-space thumbnail
 * checkbox. The backend enforces the same switch, so this is only UX.
 *
 * Resolves to `true` until the organization has loaded, and on servers that
 * predate the setting.
 */
export const useDataAppCapturesEnabled = (): boolean => {
    const { data: organization } = useOrganization();
    return organization?.dataAppCapturesEnabled !== false;
};
