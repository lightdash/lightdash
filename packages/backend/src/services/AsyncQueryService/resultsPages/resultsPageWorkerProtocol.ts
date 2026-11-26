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
          phase: 'rows';
          rows: Uint8Array;
          rowCount: number;
      }
    | {
          id: number;
          ok: true;
          phase: 'compressed';
          compressed: Uint8Array;
      }
    | {
          id: number;
          ok: false;
          message: string;
      };
