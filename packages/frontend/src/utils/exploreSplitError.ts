import { type ApiErrorDetail } from '@lightdash/common';

export const getCandidateExploreNames = (
    data: ApiErrorDetail['data'],
): string[] =>
    Array.isArray(data?.candidateExploreNames)
        ? data.candidateExploreNames.filter(
              (candidate): candidate is string => typeof candidate === 'string',
          )
        : [];
