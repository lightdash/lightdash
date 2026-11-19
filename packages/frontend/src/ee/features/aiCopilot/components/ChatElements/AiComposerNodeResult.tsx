import { type FC } from 'react';
import { ComposerNodeResultTable } from '../../../../../features/composerCharts/lineage/ComposerNodeResultTable';
import {
    useComposerNodeResults,
    type ComposerPanelSource,
} from './useComposerNodeResults';

type Props = {
    projectUuid: string;
    agentUuid: string;
    source: ComposerPanelSource;
    queryUuid: string;
};

/** A pipeline node's own rows, read through the agent's results route. */
export const AiComposerNodeResult: FC<Props> = ({
    projectUuid,
    agentUuid,
    source,
    queryUuid,
}) => {
    const results = useComposerNodeResults({
        projectUuid,
        agentUuid,
        source,
        queryUuid,
    });
    return (
        <ComposerNodeResultTable projectUuid={projectUuid} results={results} />
    );
};
