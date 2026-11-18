import { type ApiCaptureRouteRequest } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildCaptureRoutingPrompt,
    sanitizeCaptureRoute,
} from './captureRouter';

const request: ApiCaptureRouteRequest = {
    dashboardName: 'Sales overview',
    gridColumns: 36,
    tiles: [
        { uuid: 'rev', title: 'Revenue by month', x: 0, y: 0, w: 18, h: 6 },
        { uuid: 'ord', title: 'Orders by status', x: 18, y: 0, w: 18, h: 6 },
        { uuid: 'tbl', title: 'Top customers', x: 0, y: 6, w: 36, h: 8 },
    ],
    marks: [
        {
            number: 1,
            image: 1,
            shape: 'arrow',
            at: { tileUuid: 'tbl', cell: null },
            arrowTo: { tileUuid: 'rev', cell: null },
            path: [
                { tileUuid: 'tbl', cell: null },
                { tileUuid: null, cell: { x: 4, y: 6 } },
                { tileUuid: 'rev', cell: null },
            ],
            speech: 'move this up here',
        },
        {
            number: 2,
            image: 2,
            shape: 'underline',
            at: { tileUuid: 'ord', cell: null },
            arrowTo: null,
            path: [{ tileUuid: 'ord', cell: null }],
            speech: 'why did cancelled orders jump in March',
        },
    ],
    looseSpeech: ['and that is all'],
    images: ['aaaa', 'bbbb'],
};

describe('buildCaptureRoutingPrompt', () => {
    it('lists tiles, marks with their words, and loose speech', () => {
        const prompt = buildCaptureRoutingPrompt(request);
        expect(prompt).toContain('Dashboard: Sales overview (36 columns)');
        expect(prompt).toContain(
            '- rev "Revenue by month" at x=0 y=0, w=18 h=6',
        );
        expect(prompt).toContain(
            '1. (image 1) arrow from tile tbl to tile rev; drawn across tile tbl, then empty space at x=4 y=6, then tile rev: "move this up here"',
        );
        expect(prompt).toContain(
            '2. (image 2) underline on tile ord; drawn across tile ord: "why did cancelled orders jump in March"',
        );
        expect(prompt).toContain('- "and that is all"');
        expect(prompt).toContain(
            '2 screenshots are attached, in order, with the numbered red marks drawn on them.',
        );
    });

    it('describes empty cells and unknown places', () => {
        const prompt = buildCaptureRoutingPrompt({
            ...request,
            marks: [
                {
                    number: 1,
                    image: 0,
                    shape: 'arrow',
                    at: { tileUuid: 'rev', cell: null },
                    arrowTo: { tileUuid: null, cell: { x: 18, y: 14 } },
                    path: [],
                    speech: '',
                },
                {
                    number: 2,
                    image: 0,
                    shape: 'circle',
                    at: { tileUuid: null, cell: null },
                    arrowTo: null,
                    path: [],
                    speech: 'what is this',
                },
            ],
            looseSpeech: [],
            images: [],
        });
        expect(prompt).toContain(
            '1. arrow from tile rev to empty space at x=18 y=14 (nothing said)',
        );
        expect(prompt).toContain('2. circle on nothing known: "what is this"');
    });
});

describe('sanitizeCaptureRoute', () => {
    it('keeps valid operations and questions', () => {
        expect(
            sanitizeCaptureRoute(
                {
                    layout: [
                        {
                            type: 'swap',
                            tileUuid: 'tbl',
                            withTileUuid: 'rev',
                            x: null,
                            y: null,
                            w: null,
                            h: null,
                        },
                        {
                            type: 'move',
                            tileUuid: 'ord',
                            withTileUuid: null,
                            x: 0,
                            y: 14,
                            w: null,
                            h: null,
                        },
                        {
                            type: 'resize',
                            tileUuid: 'rev',
                            withTileUuid: null,
                            x: null,
                            y: null,
                            w: 36,
                            h: 4,
                        },
                    ],
                    questions: [
                        {
                            text: 'Why did cancelled orders jump in March?',
                            tileUuids: ['ord'],
                        },
                    ],
                },
                request,
            ),
        ).toEqual({
            layout: [
                { type: 'swap', tileUuid: 'tbl', withTileUuid: 'rev' },
                { type: 'move', tileUuid: 'ord', x: 0, y: 14 },
                { type: 'resize', tileUuid: 'rev', w: 36, h: 4 },
            ],
            questions: [
                {
                    text: 'Why did cancelled orders jump in March?',
                    tileUuids: ['ord'],
                },
            ],
        });
    });

    it('drops operations on tiles that do not exist or lack their numbers', () => {
        expect(
            sanitizeCaptureRoute(
                {
                    layout: [
                        {
                            type: 'move',
                            tileUuid: 'ghost',
                            withTileUuid: null,
                            x: 0,
                            y: 0,
                            w: null,
                            h: null,
                        },
                        {
                            type: 'move',
                            tileUuid: 'rev',
                            withTileUuid: null,
                            x: null,
                            y: 2,
                            w: null,
                            h: null,
                        },
                        {
                            type: 'swap',
                            tileUuid: 'rev',
                            withTileUuid: 'rev',
                            x: null,
                            y: null,
                            w: null,
                            h: null,
                        },
                        {
                            type: 'swap',
                            tileUuid: 'rev',
                            withTileUuid: 'ghost',
                            x: null,
                            y: null,
                            w: null,
                            h: null,
                        },
                    ],
                    questions: [],
                },
                request,
            ).layout,
        ).toEqual([]);
    });

    it('keeps tiles inside the grid', () => {
        expect(
            sanitizeCaptureRoute(
                {
                    layout: [
                        {
                            type: 'move',
                            tileUuid: 'rev',
                            withTileUuid: null,
                            x: 30,
                            y: -3,
                            w: null,
                            h: null,
                        },
                        {
                            type: 'resize',
                            tileUuid: 'ord',
                            withTileUuid: null,
                            x: null,
                            y: null,
                            w: 99,
                            h: 0,
                        },
                    ],
                    questions: [],
                },
                request,
            ).layout,
        ).toEqual([
            { type: 'move', tileUuid: 'rev', x: 18, y: 0 },
            { type: 'resize', tileUuid: 'ord', w: 18, h: 1 },
        ]);
    });

    it('drops empty questions and unknown tile references', () => {
        expect(
            sanitizeCaptureRoute(
                {
                    layout: [],
                    questions: [
                        { text: '   ', tileUuids: ['ord'] },
                        { text: 'What is this?', tileUuids: ['ghost', 'tbl'] },
                    ],
                },
                request,
            ).questions,
        ).toEqual([{ text: 'What is this?', tileUuids: ['tbl'] }]);
    });
});
