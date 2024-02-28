import { FC } from 'react';
import { Link, useParams } from 'react-router-dom';

const ExploreIndex: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    return (
        <div>
            start exploring or create a new explore{' '}
            <Link to={`/projects/${projectUuid}/explore/new`}>here</Link>
        </div>
    );
};

export default ExploreIndex;
