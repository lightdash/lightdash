/**
 * Value of the Permissions-Policy header sent with every response. The camera
 * is always off. The microphone is off unless the instance turns it on for
 * Voice Design, which records the user's voice on the page itself.
 */
export const permissionsPolicyHeader = ({
    microphoneEnabled,
}: {
    microphoneEnabled: boolean;
}): string => `camera=(), microphone=${microphoneEnabled ? '(self)' : '()'}`;
