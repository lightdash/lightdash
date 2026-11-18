import { type ApiSuccess } from '../../types/api/success';

/** A dashboard tile as the capture router sees it, in grid units. */
export type CaptureRouteTile = {
    uuid: string;
    title: string;
    x: number;
    y: number;
    w: number;
    h: number;
};

/** Where a mark points: a tile, an empty grid cell, or nothing known. */
export type CaptureRoutePlace = {
    tileUuid: string | null;
    cell: { x: number; y: number } | null;
};

/** One drawn mark from a point-and-talk capture and the words said with it. */
export type CaptureRouteMark = {
    number: number;
    /** Which attached screenshot shows this mark, from 1. Zero when none. */
    image: number;
    shape: string;
    at: CaptureRoutePlace;
    /** Where an arrow ends. Null for marks that are not arrows. */
    arrowTo: CaptureRoutePlace | null;
    /** Everything the stroke passed over, in the order it was drawn. */
    path: CaptureRoutePlace[];
    speech: string;
};

export type ApiCaptureRouteRequest = {
    dashboardName: string;
    gridColumns: number;
    tiles: CaptureRouteTile[];
    marks: CaptureRouteMark[];
    /** Things said that were not attached to any mark. */
    looseSpeech: string[];
    /** Screenshots with the marks drawn on, as base64 JPEG, in order. */
    images: string[];
};

/** A layout change the page applies itself, without an agent. */
export type CaptureLayoutOp =
    | { type: 'move'; tileUuid: string; x: number; y: number }
    | { type: 'resize'; tileUuid: string; w: number; h: number }
    | { type: 'swap'; tileUuid: string; withTileUuid: string };

/** A question to hand to the AI agent, with the tiles it is about. */
export type CaptureQuestion = { text: string; tileUuids: string[] };

export type CaptureRoute = {
    layout: CaptureLayoutOp[];
    questions: CaptureQuestion[];
};

export type ApiCaptureRouteResponse = ApiSuccess<CaptureRoute>;
