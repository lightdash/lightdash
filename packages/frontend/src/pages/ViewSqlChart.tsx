import { type FC } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import ErrorState from '../components/common/ErrorState';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useSavedQuery } from '../hooks/useSavedQuery';

/**
 * A SQL chart is a saved chart under the same uuid, so its old address
 * (`/sql-runner/:slug`, a slug or a uuid) sends the reader to the chart's
 * own page, keeping the query string a scheduler link carries.
 */
const ViewSqlChartPage: FC = () => {
    const { slug } = useParams<{ slug?: string }>();
    const { search } = useLocation();
    const projectUuid = useProjectUuid();
    const { data, error } = useSavedQuery({ uuidOrSlug: slug, projectUuid });
    if (error) return <ErrorState error={error.error} />;
    if (!data) return <SuboptimalState title="Loading chart" loading />;
    return (
        <Navigate
            to={`/projects/${projectUuid}/saved/${data.uuid}/view${search}`}
            replace
        />
    );
};

export default ViewSqlChartPage;
