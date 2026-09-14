import {
    CreateDashboardChartTile,
    CreateDashboardLoomTile,
    CreateDashboardMarkdownTile,
    DashboardTileTypes,
    generateSlug,
    sanitizeHtml,
    SEED_ORG_1_ADMIN,
    SEED_ORG_1_EDITOR,
    SEED_ORG_1_VIEWER,
    SEED_PROJECT,
} from '@lightdash/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SpaceModel } from '../../../models/SpaceModel';
import { DashboardTileCommentsTableName } from '../../entities/comments';
import {
    DbNotificationResourceType,
    NotificationsTableName,
} from '../../entities/notifications';

// A dashboard with a thread on every tile, across two tabs, so the
// dashboard-wide comments panel has something to show: replies, mentions,
// resolved threads, and unread notifications for the demo user.

const DASHBOARD_NAME = 'Weekly revenue review';

type SeedUser = {
    user_uuid: string;
    first_name: string;
    last_name: string;
};

const david = SEED_ORG_1_ADMIN;
const editor = SEED_ORG_1_EDITOR;
const viewer = SEED_ORG_1_VIEWER;

const fullName = (user: SeedUser) => `${user.first_name} ${user.last_name}`;

const mention = (user: SeedUser) =>
    `<span style="color: #228be6; font-weight: 500;">@${fullName(user)}</span>`;

type SeedComment = {
    author: SeedUser;
    text: string;
    /** HTML with mentions; defaults to the text wrapped in a paragraph. */
    html?: string;
    mentions?: SeedUser[];
    daysAgo: number;
    resolved?: boolean;
    replies?: Omit<SeedComment, 'replies' | 'resolved'>[];
};

type SeedTileComments = {
    tileUuid: string;
    tileTitle: string;
    threads: SeedComment[];
};

const revenueIntro = `This review covers the trailing 12 months of Jaffle Shop revenue. Numbers refresh every morning; leave a comment on any tile if something looks off.`;
const ordersIntro = `Order volume, customer spend, and customers we have not seen in a while.`;

async function createDashboard(knex: Knex) {
    const dashboardModel = new DashboardModel({ database: knex });
    const spaceModel = new SpaceModel({ database: knex });
    const chartModel = new SavedChartModel({
        database: knex,
        lightdashConfig,
    });

    const [seedSpace] = await spaceModel.find({
        projectUuid: SEED_PROJECT.project_uuid,
        slug: 'jaffle-shop',
    });
    const spaceUuid = seedSpace?.uuid;
    if (!spaceUuid) throw new Error('No space found for seeding');

    const savedCharts = await chartModel.find({
        projectUuid: SEED_PROJECT.project_uuid,
    });
    const getChartUuid = (name: string) => {
        const chart = savedCharts.find(
            ({ name: chartName }) => chartName === name,
        );
        if (!chart) {
            throw new Error(`Could not find seeded chart with name ${name}`);
        }
        return chart.uuid;
    };

    const revenueIntroTileUuid = uuidv4();
    const totalRevenueTileUuid = uuidv4();
    const revenueByPaymentTileUuid = uuidv4();
    const signupsTileUuid = uuidv4();
    const ordersIntroTileUuid = uuidv4();
    const ordersOverTimeTileUuid = uuidv4();
    const averageSpendTileUuid = uuidv4();
    const lapsedCustomersTileUuid = uuidv4();
    const walkthroughTileUuid = uuidv4();

    const revenueTab = { uuid: uuidv4(), name: 'Revenue', order: 0 };
    const ordersTab = { uuid: uuidv4(), name: 'Orders', order: 1 };

    const chartTile = (
        uuid: string,
        tabUuid: string,
        position: { x: number; y: number; w: number; h: number },
        chartName: string,
    ): CreateDashboardChartTile => ({
        uuid,
        ...position,
        type: DashboardTileTypes.SAVED_CHART,
        tabUuid,
        properties: { savedChartUuid: getChartUuid(chartName) },
    });

    const revenueIntroTile: CreateDashboardMarkdownTile = {
        uuid: revenueIntroTileUuid,
        x: 0,
        y: 0,
        w: 36,
        h: 3,
        type: DashboardTileTypes.MARKDOWN,
        tabUuid: revenueTab.uuid,
        properties: { title: 'About this review', content: revenueIntro },
    };
    const totalRevenueTile = chartTile(
        totalRevenueTileUuid,
        revenueTab.uuid,
        { x: 0, y: 3, w: 12, h: 6 },
        "What's our total revenue to date?",
    );
    const revenueByPaymentTile = chartTile(
        revenueByPaymentTileUuid,
        revenueTab.uuid,
        { x: 12, y: 3, w: 24, h: 9 },
        'How much revenue do we have per payment method?',
    );
    const signupsTile = chartTile(
        signupsTileUuid,
        revenueTab.uuid,
        { x: 0, y: 9, w: 12, h: 9 },
        'Customer signups by month',
    );

    const ordersIntroTile: CreateDashboardMarkdownTile = {
        uuid: ordersIntroTileUuid,
        x: 0,
        y: 0,
        w: 36,
        h: 3,
        type: DashboardTileTypes.MARKDOWN,
        tabUuid: ordersTab.uuid,
        properties: {
            title: 'Orders and customer activity',
            content: ordersIntro,
        },
    };
    const ordersOverTimeTile = chartTile(
        ordersOverTimeTileUuid,
        ordersTab.uuid,
        { x: 0, y: 3, w: 24, h: 9 },
        'How many orders we have over time ?',
    );
    const averageSpendTile = chartTile(
        averageSpendTileUuid,
        ordersTab.uuid,
        { x: 24, y: 3, w: 12, h: 9 },
        "What's the average spend per customer?",
    );
    const lapsedCustomersTile = chartTile(
        lapsedCustomersTileUuid,
        ordersTab.uuid,
        { x: 0, y: 12, w: 24, h: 9 },
        'Which customers have not recently ordered an item?',
    );
    const walkthroughTile: CreateDashboardLoomTile = {
        uuid: walkthroughTileUuid,
        x: 24,
        y: 12,
        w: 12,
        h: 9,
        type: DashboardTileTypes.LOOM,
        tabUuid: ordersTab.uuid,
        properties: {
            title: 'Walkthrough of this review',
            url: 'https://www.loom.com/share/6b8d3d5ccc644fa8bf68ffb754cbb783',
        },
    };

    const dashboard = await dashboardModel.create(
        spaceUuid,
        {
            name: DASHBOARD_NAME,
            description:
                'Weekly look at revenue and orders, reviewed by the whole team.',
            tiles: [
                revenueIntroTile,
                totalRevenueTile,
                revenueByPaymentTile,
                signupsTile,
                ordersIntroTile,
                ordersOverTimeTile,
                averageSpendTile,
                lapsedCustomersTile,
                walkthroughTile,
            ],
            tabs: [revenueTab, ordersTab],
            slug: generateSlug(DASHBOARD_NAME),
        },
        { userUuid: david.user_uuid },
        SEED_PROJECT.project_uuid,
    );

    const tileComments: SeedTileComments[] = [
        {
            tileUuid: revenueIntroTileUuid,
            tileTitle: 'About this review',
            threads: [
                {
                    author: editor,
                    text: 'Can we say which date range this covers? Reviewers keep asking.',
                    daysAgo: 9,
                    resolved: true,
                    replies: [
                        {
                            author: david,
                            text: 'Added a line about the trailing 12 months.',
                            daysAgo: 8,
                        },
                    ],
                },
            ],
        },
        {
            tileUuid: totalRevenueTileUuid,
            tileTitle: "What's our total revenue to date?",
            threads: [
                {
                    author: viewer,
                    text: 'Does this include refunded orders? The finance number is about 4% lower.',
                    daysAgo: 6,
                    replies: [
                        {
                            author: editor,
                            text: `${fullName(
                                david,
                            )} can you confirm whether the orders model filters refunds?`,
                            html: `<p>${mention(
                                david,
                            )} can you confirm whether the orders model filters refunds?</p>`,
                            mentions: [david],
                            daysAgo: 5,
                        },
                        {
                            author: david,
                            text: "It doesn't yet. I'll add an is_refunded flag to the model this week.",
                            daysAgo: 4,
                        },
                    ],
                },
            ],
        },
        {
            tileUuid: revenueByPaymentTileUuid,
            tileTitle: 'How much revenue do we have per payment method?',
            threads: [
                {
                    author: david,
                    text: 'Gift card looks unusually high for March. Worth checking whether the bulk corporate order got coded as gift card.',
                    daysAgo: 7,
                },
                {
                    author: viewer,
                    text: 'Could we sort this descending? Easier to scan.',
                    daysAgo: 10,
                    resolved: true,
                    replies: [
                        {
                            author: david,
                            text: 'Done.',
                            daysAgo: 9,
                        },
                    ],
                },
            ],
        },
        {
            tileUuid: signupsTileUuid,
            tileTitle: 'Customer signups by month',
            threads: [
                {
                    author: viewer,
                    text: 'Twelve slices is hard to read. A bar chart would work better here.',
                    daysAgo: 3,
                },
            ],
        },
        {
            tileUuid: ordersIntroTileUuid,
            tileTitle: 'Orders and customer activity',
            threads: [
                {
                    author: editor,
                    text: 'Typo in the second sentence: "activty".',
                    daysAgo: 11,
                    resolved: true,
                },
            ],
        },
        {
            tileUuid: ordersOverTimeTileUuid,
            tileTitle: 'How many orders we have over time ?',
            threads: [
                {
                    author: viewer,
                    text: 'The dip in the second week of February lines up with the site outage, so it is real, not a data gap.',
                    daysAgo: 5,
                    replies: [
                        {
                            author: david,
                            text: 'Thanks, I will add that as an annotation.',
                            daysAgo: 4,
                        },
                    ],
                },
                {
                    author: editor,
                    text: 'Can we get this weekly instead of daily? Daily is too noisy to spot the trend.',
                    daysAgo: 1,
                },
            ],
        },
        {
            tileUuid: averageSpendTileUuid,
            tileTitle: "What's the average spend per customer?",
            threads: [
                {
                    author: editor,
                    text: `${fullName(
                        viewer,
                    )} this is the chart you asked about in standup.`,
                    html: `<p>${mention(
                        viewer,
                    )} this is the chart you asked about in standup.</p>`,
                    mentions: [viewer],
                    daysAgo: 2,
                },
            ],
        },
        {
            tileUuid: lapsedCustomersTileUuid,
            tileTitle: 'Which customers have not recently ordered an item?',
            threads: [
                {
                    author: viewer,
                    text: 'Could we add the last order date as a column?',
                    daysAgo: 2,
                },
                {
                    author: david,
                    text: 'Hiding the customer id column would make this readable on a laptop.',
                    daysAgo: 12,
                    resolved: true,
                },
            ],
        },
        {
            tileUuid: walkthroughTileUuid,
            tileTitle: 'Walkthrough of this review',
            threads: [
                {
                    author: editor,
                    text: 'Worth re-recording once the refund filter lands.',
                    daysAgo: 1,
                },
            ],
        },
    ];

    return { dashboard, tileComments };
}

const daysAgo = (days: number, hour: number) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(hour, 0, 0, 0);
    return date;
};

export async function seed(knex: Knex): Promise<void> {
    const { dashboard, tileComments } = await createDashboard(knex);

    const insertComment = async (
        tileUuid: string,
        comment: Omit<SeedComment, 'replies'>,
        replyTo: string | null,
        hour: number,
    ): Promise<string> => {
        const [row] = await knex(DashboardTileCommentsTableName)
            .insert({
                text: comment.text,
                text_html: sanitizeHtml(
                    comment.html ?? `<p>${comment.text}</p>`,
                ),
                dashboard_tile_uuid: tileUuid,
                reply_to: replyTo,
                user_uuid: comment.author.user_uuid,
                saved_chart_uuid: null,
                mentions: (comment.mentions ?? []).map((u) => u.user_uuid),
                resolved: comment.resolved ?? false,
                created_at: daysAgo(comment.daysAgo, hour),
            })
            .returning('comment_id');
        return row.comment_id;
    };

    const notify = async (
        recipientUuid: string,
        author: SeedUser,
        commentId: string,
        tileUuid: string,
        tileTitle: string,
        tagged: boolean,
    ) => {
        await knex(NotificationsTableName).insert({
            user_uuid: recipientUuid,
            resource_uuid: commentId,
            resource_type: DbNotificationResourceType.DashboardComments,
            message: `${fullName(author)} ${
                tagged ? 'tagged you' : 'commented'
            } in dashboard "${dashboard.name}" in tile "${tileTitle}"`,
            url: `/dashboards/${dashboard.uuid}`,
            metadata: JSON.stringify({
                dashboard_uuid: dashboard.uuid,
                dashboard_name: dashboard.name,
                dashboard_tile_uuid: tileUuid,
                dashboard_tile_name: tileTitle,
            }),
        });
    };

    const seedThread = async (
        tileUuid: string,
        tileTitle: string,
        thread: SeedComment,
    ) => {
        const threadId = await insertComment(tileUuid, thread, null, 9);
        const replies = thread.replies ?? [];
        // Replies inherit the thread's resolved state.
        const replyIds = await Promise.all(
            replies.map((reply, index) =>
                insertComment(
                    tileUuid,
                    { ...reply, resolved: thread.resolved },
                    threadId,
                    10 + index,
                ),
            ),
        );
        if (thread.resolved) return;

        const notifyMentions = (
            comment: Pick<SeedComment, 'author' | 'mentions'>,
            commentId: string,
        ) =>
            (comment.mentions ?? []).map((mentioned) =>
                notify(
                    mentioned.user_uuid,
                    comment.author,
                    commentId,
                    tileUuid,
                    tileTitle,
                    true,
                ),
            );

        await Promise.all([
            ...notifyMentions(thread, threadId),
            ...replies.flatMap((reply, index) => {
                const replyId = replyIds[index];
                const mentionedUuids = (reply.mentions ?? []).map(
                    (u) => u.user_uuid,
                );
                const earlierAuthors = new Set(
                    [thread, ...replies.slice(0, index)].map(
                        (c) => c.author.user_uuid,
                    ),
                );
                const participantsToNotify = [...earlierAuthors].filter(
                    (uuid) =>
                        uuid !== reply.author.user_uuid &&
                        !mentionedUuids.includes(uuid),
                );
                return [
                    ...notifyMentions(reply, replyId),
                    ...participantsToNotify.map((uuid) =>
                        notify(
                            uuid,
                            reply.author,
                            replyId,
                            tileUuid,
                            tileTitle,
                            false,
                        ),
                    ),
                ];
            }),
        ]);
    };

    await Promise.all(
        tileComments.flatMap(({ tileUuid, tileTitle, threads }) =>
            threads.map((thread) => seedThread(tileUuid, tileTitle, thread)),
        ),
    );
}
