import type { RawResultRow } from '@lightdash/common';
import { createWorkerFactory, useWorker } from '@shopify/react-web-worker';
import { useCallback } from 'react';
import { type getResultsFromStream } from '../../../utils/request';

const createWorker = createWorkerFactory<{
    getResultsFromStream: typeof getResultsFromStream<RawResultRow>;
}>(() => import('../../../utils/request'));

export const useResultsFromStreamWorker = () => {
    const worker = useWorker(createWorker);

    const getResultsFromStream = useCallback(
        async (url: string | undefined): Promise<RawResultRow[]> => {
            return worker.getResultsFromStream(url);
        },
        [worker],
    );

    return { getResultsFromStream };
};
