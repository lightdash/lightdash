type HttpMethod = 'GET' | 'POST';

/**
 * Builds the data-exfiltration warning shown at connection create + link time.
 * Escalates when POST is enabled (write actions on the remote origin).
 */
export const buildExfilWarning = (
    origin: string,
    allowedMethods: HttpMethod[],
): string => {
    const target = origin || 'this origin';
    let message = `Apps linked to this connection can send any data they can query to ${target}.`;
    if (allowedMethods.includes('POST')) {
        message += ` …and perform write actions on ${target}.`;
    }
    return message;
};
