/**
 * Something a live data source result leaves out or counts its own way,
 * which the rows alone don't show. The results panel and the AI agent show
 * `message` as written, so both say the same thing.
 */
export type LiveResultNotice =
    | {
          /** The integration had rows past the ones returned. */
          type: 'truncated';
          rowCount: number;
          message: string;
      }
    | {
          /** No date filter, so the source's default window applied. */
          type: 'defaultDateWindow';
          fieldId: string;
          days: number;
          message: string;
      }
    | {
          /** The provider counts differently because of these fields. */
          type: 'providerCounting';
          fieldIds: string[];
          message: string;
      };

export type LiveResultNoticeType = LiveResultNotice['type'];
