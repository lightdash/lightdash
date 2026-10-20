import { type RecordDataAppViewOutcome } from '@lightdash/common';
import { useCallback, useRef } from 'react';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

export const useAppViewOutcomes = ({
    projectUuid,
    appUuid,
    src,
    previewToken,
    navigationId,
}: {
    projectUuid: string;
    appUuid: string;
    src: string;
    previewToken: string;
    navigationId: string;
}) => {
    const api = useLightdashApi();
    const observed = useRef({
        navigationId,
        outcomes: new Set<RecordDataAppViewOutcome['outcome']>(),
    });
    if (observed.current.navigationId !== navigationId) {
        observed.current = { navigationId, outcomes: new Set() };
    }

    return useCallback(
        (
            outcome: RecordDataAppViewOutcome['outcome'],
            reportedNavigationId: string | undefined,
        ) => {
            if (
                reportedNavigationId !== navigationId ||
                observed.current.outcomes.has(outcome)
            ) {
                return;
            }
            const version = src.match(/\/versions\/(\d+)\//)?.[1];
            if (!version) return;
            observed.current.outcomes.add(outcome);
            try {
                void api<undefined>({
                    method: 'POST',
                    sensitive: true,
                    url: `/ee/projects/${projectUuid}/apps/${appUuid}/versions/${version}/view-outcome`,
                    body: JSON.stringify({
                        previewToken,
                        navigationId,
                        outcome,
                    } satisfies RecordDataAppViewOutcome),
                }).catch(() => {});
            } catch {
                // Telemetry must not interrupt a running app.
            }
        },
        [api, projectUuid, appUuid, src, previewToken, navigationId],
    );
};
