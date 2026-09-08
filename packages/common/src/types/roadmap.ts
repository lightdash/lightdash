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

export const RoadmapItemSchema = z
    .object({
        ticketId: z.string().min(1).max(255),
        title: z.string().min(1),
        description: z.string().nullable(),
        status: z.enum(RoadmapItemStatus),
        priority: z.enum(RoadmapItemPriority),
        createdAt: z.string().datetime({ offset: true }),
        updatedAt: z.string().datetime({ offset: true }),
        issueUrl: githubIssueUrlSchema.nullable(),
        pullRequestUrl: githubPullRequestUrlSchema.nullable(),
    })
    .strict();

export const RoadmapProjectQuerySchema = z
    .object({
        page: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        statuses: z
            .string()
            .max(255)
            .refine(
                (value) =>
                    value === '' ||
                    value
                        .split(',')
                        .every((status) =>
                            [
                                'backlog',
                                'planned',
                                'started',
                                'paused',
                                'completed',
                                'canceled',
                            ].includes(status),
                        ),
                'Unknown roadmap status',
            )
            .optional(),
        priorities: z
            .string()
            .max(255)
            .refine(
                (value) =>
                    value === '' ||
                    value
                        .split(',')
                        .every((priority) =>
                            (
                                Object.values(
                                    RoadmapItemPriority,
                                ) as readonly string[]
                            ).includes(priority),
                        ),
                'Unknown roadmap priority',
            )
            .optional(),
        search: z.string().max(255).optional(),
        onlyInterested: z.boolean().optional(),
    })
    .strict();
export const RoadmapQuerySchema = RoadmapProjectQuerySchema.omit({
    onlyInterested: true,
}).extend({
    projectId: z.string().min(1).max(255).optional(),
});

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

const RoadmapRequestSchema = RoadmapItemSchema.extend({
    projectId: z.string().min(1).nullable().optional(),
});

export type RoadmapResponse = {
    status: 'ok';
    results: (RoadmapItem & { projectId?: string | null })[];
    expiresAt?: string;
    pagination: RoadmapPagination;
    facets: RoadmapFacets;
};

export const RoadmapResponseSchema = z
    .object({
        status: z.literal('ok'),
        results: z.array(RoadmapRequestSchema),
        expiresAt: z.string().datetime({ offset: true }).optional(),
        pagination: RoadmapPaginationSchema,
        facets: RoadmapFacetsSchema,
    })
    .strict();

export type RoadmapResults = {
    data: RoadmapResponse['results'];
    expiresAt?: string;
    pagination: RoadmapPagination;
    facets: RoadmapFacets;
};

export type ApiRoadmapResponse = {
    status: 'ok';
    results: RoadmapResults;
};

export type RoadmapProjectQuery = z.infer<typeof RoadmapProjectQuerySchema>;
export const RoadmapProjectRequestsQuerySchema = RoadmapQuerySchema.required({
    projectId: true,
});
export type RoadmapProjectRequestsQuery = z.infer<
    typeof RoadmapProjectRequestsQuerySchema
>;

export type RoadmapProject = {
    projectId: string;
    title: string;
    icon: string | null;
    stage: 'backlog' | 'planned' | 'started' | 'paused' | 'completed';
    progress: number;
    priority: RoadmapItemPriority;
};
export type RoadmapProjectGroup = {
    project: RoadmapProject;
    ownRequestCount: number;
    hasDirectNeed: boolean;
};
export type RoadmapProjectPagination = {
    page: number;
    pageSize: number;
    totalResults: number;
    totalPages: number;
};
export type RoadmapProjectResults = {
    projects: RoadmapProjectGroup[];
    otherRequestCount: number;
    pagination: RoadmapProjectPagination;
    expiresAt: string;
};
export type RoadmapProjectRequestsResults = {
    data: (RoadmapItem & { projectId: string | null })[];
    pagination: RoadmapPagination;
    facets: RoadmapFacets;
    expiresAt: string;
};
const RoadmapProjectPaginationSchema = z
    .object({
        page: z.number().int().min(1),
        pageSize: z.number().int().min(1).max(100),
        totalResults: z.number().int().min(0),
        totalPages: z.number().int().min(0),
    })
    .strict();
export const RoadmapProjectResultsSchema: z.ZodType<RoadmapProjectResults> = z
    .object({
        projects: z.array(
            z
                .object({
                    project: z
                        .object({
                            projectId: z.string().min(1),
                            title: z.string().trim().min(1),
                            icon: z.string().max(255).nullable(),
                            stage: z.enum([
                                'backlog',
                                'planned',
                                'started',
                                'paused',
                                'completed',
                            ]),
                            progress: z.number().min(0).max(100),
                            priority: z.enum(RoadmapItemPriority),
                        })
                        .strict(),
                    ownRequestCount: z.number().int().min(0),
                    hasDirectNeed: z.boolean(),
                })
                .strict(),
        ),
        otherRequestCount: z.number().int().min(0),
        pagination: RoadmapProjectPaginationSchema,
        expiresAt: z.string().datetime({ offset: true }),
    })
    .strict();
export const RoadmapProjectRequestsResponseSchema =
    RoadmapResponseSchema.extend({
        results: z.array(RoadmapRequestSchema.required({ projectId: true })),
        expiresAt: z.string().datetime({ offset: true }),
    });
export const RoadmapProjectRequestsResultsSchema: z.ZodType<RoadmapProjectRequestsResults> =
    RoadmapProjectRequestsResponseSchema.omit({
        status: true,
        results: true,
    }).extend({
        data: RoadmapProjectRequestsResponseSchema.shape.results,
    });
export const RoadmapProjectResponseSchema = z
    .object({ status: z.literal('ok'), results: RoadmapProjectResultsSchema })
    .strict();
export type ApiRoadmapProjectResponse = {
    status: 'ok';
    results: RoadmapProjectResults;
};
