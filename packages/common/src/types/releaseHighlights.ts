export type ReleaseHighlight = {
    title: string;
    benefit: string;
    url: string;
    version: string;
    requestedByYourOrganization: boolean;
};

export type ReleaseHighlightsResult =
    | {
          status: 'ready';
          fromVersion: string;
          toVersion: string;
          highlights: ReleaseHighlight[];
          generatedAt: Date;
      }
    | {
          status: 'unavailable';
          reason:
              | 'not_self_hosted'
              | 'update_check_disabled'
              | 'up_to_date'
              | 'ai_not_configured'
              | 'source_unavailable'
              | 'no_features'
              | 'generation_failed'
              | 'rate_limited';
      };

export type ApiReleaseHighlights = {
    status: 'ok';
    results: ReleaseHighlightsResult;
};
