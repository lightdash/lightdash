import type { ResultsPageFormatInputs } from './buildResultsPageRows';

export type ResultsPageWorkerRequest = {
    id: number;
    lines: string[];
    format: ResultsPageFormatInputs;
    brotliQuality: number;
};

export type ResultsPageWorkerResponse =
    | {
          id: number;
          ok: true;
          rows: Uint8Array;
          compressed: Uint8Array;
          rowCount: number;
      }
    | {
          id: number;
          ok: false;
          message: string;
      };
