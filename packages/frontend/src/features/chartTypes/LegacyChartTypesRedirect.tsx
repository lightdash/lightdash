import { Navigate, useLocation } from 'react-router';

const LegacyChartTypesRedirect = () => {
    const { search, hash } = useLocation();

    return (
        <Navigate to={{ pathname: '../chart-studio', search, hash }} replace />
    );
};

export default LegacyChartTypesRedirect;
