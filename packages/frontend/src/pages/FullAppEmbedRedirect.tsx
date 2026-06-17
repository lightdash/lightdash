import { Navigate, useSearchParams } from 'react-router';

const getTargetPath = (path: string | null) => {
    if (!path || !path.startsWith('/') || path.startsWith('//')) {
        return '/projects';
    }

    return path;
};

const FullAppEmbedRedirect = () => {
    const [searchParams] = useSearchParams();

    return <Navigate to={getTargetPath(searchParams.get('path'))} replace />;
};

export default FullAppEmbedRedirect;
