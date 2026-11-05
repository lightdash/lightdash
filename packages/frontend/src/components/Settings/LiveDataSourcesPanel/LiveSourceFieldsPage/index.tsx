import { type FC } from 'react';
import { Navigate, useParams } from 'react-router';
import { getSemanticStudioSourceUrl } from '../../../../features/semanticStudio/urls';

type Props = {
    projectUuid: string;
};

/**
 * Field editing moved to Semantic Layer; old links to this page land on the
 * same source there.
 */
const LiveSourceFieldsPage: FC<Props> = ({ projectUuid }) => {
    const { connectionUuid = '' } = useParams<{ connectionUuid: string }>();
    return (
        <Navigate
            to={getSemanticStudioSourceUrl(projectUuid, connectionUuid)}
            replace
        />
    );
};

export default LiveSourceFieldsPage;
