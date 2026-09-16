import { Navigate, useLocation } from 'react-router';

const LegacyChartTypeGalleryRedirect = () => {
    const { search, hash } = useLocation();

    return (
        <Navigate to={{ pathname: '../chart-types', search, hash }} replace />
    );
};

export default LegacyChartTypeGalleryRedirect;
