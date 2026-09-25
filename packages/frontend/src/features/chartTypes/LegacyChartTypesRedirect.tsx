import { Navigate, useLocation, useParams } from 'react-router';

const LegacyChartTypesRedirect = ({
    newChartType = false,
}: {
    newChartType?: boolean;
}) => {
    const { search, hash } = useLocation();
    const { dataAppVizUuid } = useParams();
    const suffix = newChartType ? 'new' : dataAppVizUuid;

    return (
        <Navigate
            to={{
                pathname: suffix
                    ? `../chart-studio/${suffix}`
                    : '../chart-studio',
                search,
                hash,
            }}
            replace
        />
    );
};

export default LegacyChartTypesRedirect;
