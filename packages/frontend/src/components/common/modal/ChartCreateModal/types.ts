import { z } from 'zod';

export const saveToDashboardSchema = z.object({
    dashboardUuid: z.string().nullable(),
});

export type SaveToDashboardFormType = z.infer<typeof saveToDashboardSchema>;

export const saveToSpaceSchema = z.object({
    spaceUuid: z.string().nullable(),
    newSpaceName: z.string().min(1).nullable(),
});

export type SaveToSpaceFormType = z.infer<typeof saveToSpaceSchema>;

export type ChartMetadata = {
    name: string;
    description: string;
};

export const DEFAULT_CHART_METADATA = {
    name: '',
    description: '',
} as const;
