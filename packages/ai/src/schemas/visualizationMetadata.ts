import { z } from 'zod';

const visualizationMetadataSchema = z.object({
    title: z.string().describe('A descriptive title for the chart'),
    description: z
        .string()
        .describe('A descriptive summary or explanation for the chart.'),
});

export default visualizationMetadataSchema;
