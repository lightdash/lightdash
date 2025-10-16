import {
    overrideFilterGroupWithFilterRules,
    reduceRequiredDimensionFiltersToFilterRules,
    resetRequiredFilterRules,
    type Explore,
    type FilterRule,
    type Filters,
} from '@lightdash/common/dist/esm/index';

export type FiltersWorkerInput = {
    filters: Filters;
    exploreData: Explore | undefined;
    tableName: string;
    hasDefaultFiltersApplied: boolean;
};

export type FiltersWorkerOutput = Filters;

/**
 * Build processed filters (same logic as FiltersCard's processedFilters memo)
 */
function buildProcessedFilters({
    filters,
    exploreData,
    tableName,
    hasDefaultFiltersApplied,
}: FiltersWorkerInput): FiltersWorkerOutput {
    let unsavedQueryFilters = filters;

    // Step 1: refresh required flags of existing rules
    if (
        unsavedQueryFilters.dimensions &&
        exploreData?.tables?.[exploreData.baseTable]
    ) {
        const requiredFilters =
            exploreData.tables[exploreData.baseTable].requiredFilters || [];
        const allRequiredFilters: FilterRule[] =
            reduceRequiredDimensionFiltersToFilterRules(
                requiredFilters,
                undefined,
                exploreData,
            );
        const allFilterRefs = allRequiredFilters.map((f) => f.target.fieldId);
        const updatedDimensionFilters = resetRequiredFilterRules(
            unsavedQueryFilters.dimensions,
            allFilterRefs,
        );
        unsavedQueryFilters = {
            ...unsavedQueryFilters,
            dimensions: updatedDimensionFilters,
        };
    }

    // Step 2: add missing required rules (except required:false)
    if (exploreData?.tables?.[exploreData.baseTable]) {
        const requiredFilters = exploreData.tables[
            exploreData.baseTable
        ].requiredFilters?.filter((f: any) => f.required !== false);
        if (requiredFilters?.length) {
            const reducedRules: FilterRule[] =
                reduceRequiredDimensionFiltersToFilterRules(
                    requiredFilters,
                    unsavedQueryFilters.dimensions,
                    exploreData,
                );
            unsavedQueryFilters = {
                ...unsavedQueryFilters,
                dimensions: overrideFilterGroupWithFilterRules(
                    unsavedQueryFilters.dimensions,
                    reducedRules,
                    undefined,
                ),
            };
        }
    }

    // Step 3: if no model, clear dimension filters
    if (tableName.length === 0) {
        unsavedQueryFilters = { ...unsavedQueryFilters, dimensions: undefined };
    }

    return unsavedQueryFilters;
}

// Worker message types
type WorkerRequest = {
    type: 'process';
    reqId: number;
    payload: FiltersWorkerInput;
};

type WorkerResponse =
    | {
          type: 'result';
          reqId: number;
          processed: FiltersWorkerOutput;
      }
    | {
          type: 'error';
          reqId: number;
          message: string;
      };

// Worker message handler
self.addEventListener('message', (e: MessageEvent<WorkerRequest>) => {
    const { type, reqId, payload } = e.data;

    if (type !== 'process') {
        console.warn('[FiltersWorker] Unknown message type:', type);
        return;
    }

    try {
        const processed = buildProcessedFilters(payload);
        const response: WorkerResponse = {
            type: 'result',
            reqId,
            processed,
        };
        self.postMessage(response);
    } catch (error) {
        const response: WorkerResponse = {
            type: 'error',
            reqId,
            message: error instanceof Error ? error.message : String(error),
        };
        self.postMessage(response);
    }
});

console.log('[FiltersWorker] Worker loaded and ready');
