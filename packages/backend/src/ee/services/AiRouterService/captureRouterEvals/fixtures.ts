import {
    type ApiCaptureRouteRequest,
    type CaptureRoute,
} from '@lightdash/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type CaptureRoutePile } from './compareCaptureRoute';

/**
 * One case for the sorter: what the page sent and what should come back.
 * Requests carry no screenshots, so every case must be answerable from the
 * tile list, the marks and the words alone.
 */
type CaptureRouterEvalFixture = {
    name: string;
    request: ApiCaptureRouteRequest;
    expected: CaptureRoute;
    /** Which piles to compare. All three when left out. */
    piles?: CaptureRoutePile[];
};

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

/** Every fixture file, in file name order. */
export const loadCaptureRouterEvalFixtures = (): {
    file: string;
    fixture: CaptureRouterEvalFixture;
}[] =>
    fs
        .readdirSync(FIXTURES_DIR)
        .filter((file) => file.endsWith('.json'))
        .sort()
        .map((file) => ({
            file,
            fixture: JSON.parse(
                fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8'),
            ) as CaptureRouterEvalFixture,
        }));
