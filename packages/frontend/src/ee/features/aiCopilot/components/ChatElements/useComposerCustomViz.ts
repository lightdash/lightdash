import {
    getComposerCustomVizPools,
    type ComposerCustomVizConfig,
    type DataAppVizFieldMapping,
    type ResultColumn,
    type SourceQuery,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useDataAppVizRenderMetadata } from '../../../../../features/chartTypes/hooks/useDataAppVizRender';
import { reconcileDataAppVizFieldMappingWithPools } from '../../../../../features/chartTypes/utils/autoMapDataAppVizFields';
import useEmbed from '../../../../providers/Embed/useEmbed';

/**
 * A composer custom config's chart type, pinned to its recorded version, with
 * its field mapping reconciled against the result columns. Shared by the
 * renderer and the panel so both read one cached schema.
 */
export const useComposerCustomViz = ({
    projectUuid,
    vizConfig,
    columns,
    node,
}: {
    projectUuid: string;
    vizConfig: ComposerCustomVizConfig;
    columns: ResultColumn[];
    node: SourceQuery | null;
}) => {
    const { embedToken } = useEmbed();
    const renderTarget = useMemo(
        () => ({ isEmbedded: !!embedToken, savedChartUuid: undefined }),
        [embedToken],
    );
    const renderPinnedVersion = vizConfig.dataAppVizVersion;
    const metadata = useDataAppVizRenderMetadata(
        projectUuid,
        vizConfig.dataAppVizUuid,
        renderTarget,
        renderPinnedVersion,
    );
    const schema =
        metadata.data?.state === 'ready' ? metadata.data.schema : undefined;
    const pools = useMemo(
        () => getComposerCustomVizPools(columns, node),
        [columns, node],
    );
    const fieldMapping = useMemo(
        (): DataAppVizFieldMapping | undefined =>
            schema
                ? reconcileDataAppVizFieldMappingWithPools(
                      schema.fields,
                      pools,
                      vizConfig.fieldMapping,
                  )
                : undefined,
        [schema, pools, vizConfig.fieldMapping],
    );
    return {
        renderTarget,
        renderPinnedVersion,
        metadata,
        schema,
        pools,
        fieldMapping,
    };
};
