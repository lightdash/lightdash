import { z } from 'zod';

export const ROADMAP_DEFAULT_PAGE_SIZE = 100;

export enum RoadmapItemStatus {
    BACKLOG = 'Backlog',
    BUILDING = 'Building',
    SHIPPED = 'Shipped',
    CANCELED = 'Canceled',
}

export enum RoadmapItemPriority {
    URGENT = 'Urgent',
    HIGH = 'High',
    MEDIUM = 'Medium',
    LOW = 'Low',
    NO_PRIORITY = 'No priority',
}

export type RoadmapItem = {
    ticketId: string;
    title: string;
    description: string | null;
    status: RoadmapItemStatus;
    priority: RoadmapItemPriority;
    createdAt: string;
    updatedAt: string;
    issueUrl: string | null;
    pullRequestUrl: string | null;
};

const githubIssueUrlSchema = z
    .string()
    .regex(
        /^https:\/\/github\.com\/lightdash\/lightdash\/issues\/\d+\/?$/,
        'Expected a public lightdash/lightdash issue URL',
    );

const githubPullRequestUrlSchema = z
    .string()
    .regex(
        /^https:\/\/github\.com\/lightdash\/lightdash\/pull\/\d+\/?$/,
        'Expected a public lightdash/lightdash pull request URL',
    );

export const RoadmapItemSchema: z.ZodType<RoadmapItem> = z
    .object({
        ticketId: z.string().min(1).max(255),
        title: z.string().min(1),
        description: z.string().nullable(),
        status: z.nativeEnum(RoadmapItemStatus),
        priority: z.nativeEnum(RoadmapItemPriority),
        createdAt: z.string().datetime({ offset: true }),
        updatedAt: z.string().datetime({ offset: true }),
        issueUrl: githubIssueUrlSchema.nullable(),
        pullRequestUrl: githubPullRequestUrlSchema.nullable(),
    })
    .strict();

export const RoadmapQuerySchema = z
    .object({
        page: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
        pageSize: z
            .number()
            .int()
            .min(1)
            .max(ROADMAP_DEFAULT_PAGE_SIZE)
            .optional(),
    })
    .strict();

export type RoadmapQuery = z.infer<typeof RoadmapQuerySchema>;

export type RoadmapPagination = {
    page: number;
    pageSize: number;
    totalIssues: number;
    totalPages: number;
};

export const RoadmapPaginationSchema: z.ZodType<RoadmapPagination> = z
    .object({
        page: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
        pageSize: z.number().int().min(1).max(100),
        totalIssues: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
        totalPages: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    })
    .strict();

export type RoadmapFacets = {
    statusCounts: Record<RoadmapItemStatus, number>;
    priorityCounts: Record<RoadmapItemPriority, number>;
};

const roadmapCountSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const RoadmapFacetsSchema: z.ZodType<RoadmapFacets> = z
    .object({
        statusCounts: z
            .object({
                [RoadmapItemStatus.BACKLOG]: roadmapCountSchema,
                [RoadmapItemStatus.BUILDING]: roadmapCountSchema,
                [RoadmapItemStatus.SHIPPED]: roadmapCountSchema,
                [RoadmapItemStatus.CANCELED]: roadmapCountSchema,
            })
            .strict(),
        priorityCounts: z
            .object({
                [RoadmapItemPriority.URGENT]: roadmapCountSchema,
                [RoadmapItemPriority.HIGH]: roadmapCountSchema,
                [RoadmapItemPriority.MEDIUM]: roadmapCountSchema,
                [RoadmapItemPriority.LOW]: roadmapCountSchema,
                [RoadmapItemPriority.NO_PRIORITY]: roadmapCountSchema,
            })
            .strict(),
    })
    .strict();

export type RoadmapResponse = {
    status: 'ok';
    results: RoadmapItem[];
    pagination: RoadmapPagination;
    facets: RoadmapFacets;
};

export const RoadmapResponseSchema: z.ZodType<RoadmapResponse> = z
    .object({
        status: z.literal('ok'),
        results: z.array(RoadmapItemSchema),
        pagination: RoadmapPaginationSchema,
        facets: RoadmapFacetsSchema,
    })
    .strict();

export type RoadmapResults = {
    data: RoadmapItem[];
    pagination: RoadmapPagination;
    facets: RoadmapFacets;
};

export type ApiRoadmapResponse = {
    status: 'ok';
    results: RoadmapResults;
};
