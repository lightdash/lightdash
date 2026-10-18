import { type FC } from 'react';
import { useParams } from 'react-router';
import MinimalSavedExplorer from './MinimalSavedExplorer';

/** The screenshot address of a SQL chart: a saved chart under the same uuid. */
const MinimalSqlChart: FC = () => {
    const { savedSqlUuid } = useParams<{ savedSqlUuid: string }>();
    return <MinimalSavedExplorer savedQueryUuid={savedSqlUuid} />;
};

export default MinimalSqlChart;
