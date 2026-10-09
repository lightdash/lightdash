const SECRET_PATTERNS: [RegExp, string][] = [
    [/\b(?:sk|rk)-[A-Za-z0-9_-]{8,}/g, '[redacted]'],
    [/\bAKIA[0-9A-Z]{16}\b/g, '[redacted]'],
    [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]'],
    [/([?&](?:api[-_]?key|key|token|sig|signature)=)[^&\s]+/gi, '$1[redacted]'],
    [
        /\b(api[-_]?key|authorization|x-api-key|x-goog-api-key|ocp-apim-subscription-key|secret[-_]?key|access[-_]?key[-_]?id|session[-_]?token)(["']?\s*[:=]\s*["']?)(?!\[redacted\]|Bearer |Basic )[^\s"',;}]+/gi,
        '$1$2[redacted]',
    ],
];

export const scrubSecrets = (text: string): string =>
    SECRET_PATTERNS.reduce(
        (scrubbed, [pattern, replacement]) =>
            scrubbed.replace(pattern, replacement),
        text,
    );
