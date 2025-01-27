import type { SpotlightTableConfig } from '../spotlightTableConfig';

export type ApiGetSpotlightTableConfig = {
    status: 'ok';
    results: Pick<SpotlightTableConfig, 'columnConfig'>;
};
