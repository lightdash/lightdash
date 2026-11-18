// After changing the prompt or the request shape in this file, run the
// regression set against the real model (needs a model key, so it is not in CI):
//   pnpm -F backend capture-router-evals
// The cases live in ./captureRouterEvals/fixtures.
import {
    type ApiCaptureRouteRequest,
    type CaptureEdit,
    type CaptureLayoutOp,
    type CaptureQuestion,
    type CaptureRoute,
    type CaptureRoutePlace,
} from '@lightdash/common';
import { generateText, Output, type LanguageModel } from 'ai';
import { z } from 'zod';

// Flat on purpose: every provider accepts it, and the cleaning step below
// turns it into the strict union.
const RawCaptureRouteSchema = z.object({
    layout: z
        .array(
            z.object({
                type: z.enum(['move', 'resize', 'swap']),
                tileUuid: z.string().describe('The tile being changed'),
                withTileUuid: z
                    .string()
                    .nullable()
                    .describe('swap only: the tile to trade places with'),
                x: z.number().nullable().describe('move only: new column'),
                y: z.number().nullable().describe('move only: new row'),
                w: z.number().nullable().describe('resize only: new width'),
                h: z.number().nullable().describe('resize only: new height'),
            }),
        )
        .describe('Layout changes the page applies itself'),
    questions: z
        .array(
            z.object({
                text: z
                    .string()
                    .describe(
                        'The question, rewritten to stand on its own, naming the chart',
                    ),
                tileUuids: z
                    .array(z.string())
                    .describe('Tiles the question is about'),
            }),
        )
        .describe('Questions about the data, for the analyst agent'),
    edits: z
        .array(
            z.object({
                text: z
                    .string()
                    .describe(
                        'The change as a complete instruction, naming the dashboard and charts involved',
                    ),
                tileUuids: z
                    .array(z.string())
                    .describe('Tiles the change is about'),
            }),
        )
        .describe('Other changes to the dashboard, for the agent to carry out'),
});

type RawCaptureRoute = z.infer<typeof RawCaptureRouteSchema>;

const SYSTEM_PROMPT = `You sort a point-and-talk capture made on a dashboard into three piles.

The user drew numbered marks on dashboard tiles while talking. Each mark comes with the words said while it was drawn.

Marks are hand-drawn in one stroke, so the shape guess is rough. "Drawn across" lists what the stroke passed over in order: where it starts is usually the thing the user means by "this", and where it ends is usually where they want it to go. A stroke that circles one tile and then runs to another place is a request to move that tile there, even when the shape says "circle" or "scribble". Trust the words over the shape.

"Inside it" lists the tiles under the area the mark encloses, with the percent of that area on each. For a circle, this is the best guide to what the user means: tiles with a large share are the ones circled, and a tile with a small share was only clipped by the edge of the circle, so leave it out. One circle around two tiles with "swap these" means swap those two tiles with each other. Check against the screenshot when one is attached.

Pile 1, "layout": requests to rearrange the dashboard. These are done directly by the page, so express them as operations:
- move: put a tile at a grid position (x = column, y = row). Use this when an arrow ends on empty space.
- swap: trade places with another tile. Use this when the user moves a tile onto, or to the place of, another tile.
- resize: change a tile's width and height in grid units. "Full width" means the whole grid width; "half" means half of it.
Only use tile ids from the list. Do not invent layout changes nobody asked for.

Pile 2, "questions": anything asking about the data, a number, a trend or why something happened. Rewrite each as a complete question that names the chart, because the agent will not see the marks. List the tiles it is about.

When screenshots are attached, look at them: the red ink shows exactly what the user marked. A mark may be on one part of a chart (a single bar, a point on a line, one number, a legend entry, a table row) rather than the whole tile. In a question, name that specific thing, with its label and value as read from the screenshot, so the agent knows which data point is meant. A layout request is always about whole tiles.

Pile 3, "edits": requests to change the dashboard that are not a move, swap or resize of existing tiles. Examples: add or change a filter, add or remove a chart, rename something, change a chart's type or what it shows. An agent carries these out, so write each as one complete instruction that names the dashboard and the charts involved and includes every detail the user gave (which field, which values). List the tiles it is about.

Ignore filler and anything that fits no pile. Any pile may be empty. Speech is machine-transcribed and may mishear words.`;

const describePlace = (place: CaptureRoutePlace): string => {
    if (place.tileUuid) return `tile ${place.tileUuid}`;
    if (place.cell) return `empty space at x=${place.cell.x} y=${place.cell.y}`;
    return 'nothing known';
};

export const buildCaptureRoutingPrompt = (
    request: ApiCaptureRouteRequest,
): string => {
    const tiles = request.tiles.map(
        (tile) =>
            `- ${tile.uuid} "${tile.title}" at x=${tile.x} y=${tile.y}, w=${tile.w} h=${tile.h}`,
    );
    const marks = request.marks.map((mark) => {
        const where = mark.arrowTo
            ? `from ${describePlace(mark.at)} to ${describePlace(mark.arrowTo)}`
            : `on ${describePlace(mark.at)}`;
        const across =
            mark.path.length > 0
                ? `; drawn across ${mark.path.map(describePlace).join(', then ')}`
                : '';
        const inside =
            mark.inside.length > 0
                ? `; inside it: ${mark.inside.map((cover) => `tile ${cover.tileUuid} ${cover.share}%`).join(', ')}`
                : '';
        const speech = mark.speech.trim()
            ? `: "${mark.speech.trim()}"`
            : ' (nothing said)';
        const image = mark.image > 0 ? `(image ${mark.image}) ` : '';
        return `${mark.number}. ${image}${mark.shape} ${where}${across}${inside}${speech}`;
    });
    const loose = request.looseSpeech.map((text) => `- "${text}"`);

    return [
        `Dashboard: ${request.dashboardName} (${request.gridColumns} columns)`,
        'Tiles:',
        ...tiles,
        ...(request.images.length > 0
            ? [
                  `${request.images.length} screenshot${request.images.length === 1 ? ' is' : 's are'} attached, in order, with the numbered red marks drawn on them.`,
              ]
            : []),
        'Marks, in the order drawn:',
        ...(marks.length > 0 ? marks : ['(none)']),
        'Said without a mark:',
        ...(loose.length > 0 ? loose : ['(nothing)']),
    ].join('\n');
};

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, Math.round(value)));

/** Turns the model's reply into operations the page can trust. */
export const sanitizeCaptureRoute = (
    raw: RawCaptureRoute,
    request: ApiCaptureRouteRequest,
): CaptureRoute => {
    const tiles = new Map(request.tiles.map((tile) => [tile.uuid, tile]));

    const layout = raw.layout.flatMap((op): CaptureLayoutOp[] => {
        const tile = tiles.get(op.tileUuid);
        if (!tile) return [];
        switch (op.type) {
            case 'move':
                if (op.x === null || op.y === null) return [];
                return [
                    {
                        type: 'move',
                        tileUuid: tile.uuid,
                        x: clamp(op.x, 0, request.gridColumns - tile.w),
                        y: Math.max(0, Math.round(op.y)),
                    },
                ];
            case 'resize':
                if (op.w === null || op.h === null) return [];
                return [
                    {
                        type: 'resize',
                        tileUuid: tile.uuid,
                        w: clamp(op.w, 1, request.gridColumns - tile.x),
                        h: Math.max(1, Math.round(op.h)),
                    },
                ];
            case 'swap':
                if (
                    !op.withTileUuid ||
                    op.withTileUuid === tile.uuid ||
                    !tiles.has(op.withTileUuid)
                ) {
                    return [];
                }
                return [
                    {
                        type: 'swap',
                        tileUuid: tile.uuid,
                        withTileUuid: op.withTileUuid,
                    },
                ];
            default:
                return [];
        }
    });

    const questions = raw.questions.flatMap((question): CaptureQuestion[] => {
        const text = question.text.trim();
        if (!text) return [];
        return [
            {
                text,
                tileUuids: question.tileUuids.filter((uuid) => tiles.has(uuid)),
            },
        ];
    });

    const edits = raw.edits.flatMap((edit): CaptureEdit[] => {
        const text = edit.text.trim();
        if (!text) return [];
        return [
            {
                text,
                tileUuids: edit.tileUuids.filter((uuid) => tiles.has(uuid)),
            },
        ];
    });

    return { layout, questions, edits };
};

export const routeCaptureWithModel = async ({
    model,
    request,
}: {
    model: LanguageModel;
    request: ApiCaptureRouteRequest;
}): Promise<CaptureRoute> => {
    const result = await generateText({
        model,
        system: SYSTEM_PROMPT,
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: buildCaptureRoutingPrompt(request) },
                    ...request.images.map((image) => ({
                        type: 'image' as const,
                        image,
                        mediaType: 'image/jpeg',
                    })),
                ],
            },
        ],
        output: Output.object({ schema: RawCaptureRouteSchema }),
    });
    return sanitizeCaptureRoute(result.output, request);
};
