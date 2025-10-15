import { z } from 'zod';

const getFieldIdSchema = ({
    additionalDescription,
    includeCustomMetrics,
    includeTableCalculations,
}: {
    additionalDescription: string | null;
    includeCustomMetrics?: boolean;
    includeTableCalculations?: boolean;
}) =>
    z.string().describe(
        [
            additionalDescription,
            `\
"fieldId" can come from: 
    - previously searched fields
    - ${includeCustomMetrics ? 'custom metrics' : ''};
    - ${includeTableCalculations ? 'table calculations' : ''};
otherwise, it will throw an error`.trim(),
        ]
            .filter(Boolean)
            .join(' '),
    );

export { getFieldIdSchema };
