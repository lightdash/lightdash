import { subject } from '@casl/ability';
import { useHotkeys } from '@mantine/hooks';
import { memo, useEffect, type FC } from 'react';
import { useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import Explorer from '../components/Explorer';
import ExploreSideBar from '../components/Explorer/ExploreSideBar/index';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { useCatalogContext } from '../features/catalog/context/CatalogProvider';
import { useExplore } from '../hooks/useExplore';
import {
    useDateZoomGranularitySearch,
    useExplorerRoute,
    useExplorerUrlState,
} from '../hooks/useExplorerRoute';
import { useQueryResults } from '../hooks/useQueryResults';
import { useApp } from '../providers/AppProvider';
import {
    ExplorerProvider,
    useExplorerContext,
    type ExplorerReduceState,
} from '../providers/ExplorerProvider';

const ExplorerWithUrlParams = memo(
    ({
        explorerUrlState,
    }: {
        explorerUrlState: ExplorerReduceState | undefined;
    }) => {
        useExplorerRoute();
        const tableId = useExplorerContext(
            (context) => context.state.unsavedChartVersion.tableName,
        );
        const { hasSelectedField, setHasSelectedField } = useCatalogContext();
        const reset = useExplorerContext((context) => context.actions.reset);
        const { data } = useExplore(tableId);

        useEffect(() => {
            if (explorerUrlState && hasSelectedField) {
                console.log('called', explorerUrlState);

                reset(explorerUrlState);
                setHasSelectedField(false);
            }
        }, [explorerUrlState, hasSelectedField, reset, setHasSelectedField]);

        const clearQuery = useExplorerContext(
            (context) => context.actions.clearQuery,
        );
        useHotkeys([['mod + alt + k', clearQuery]]);

        return (
            <Page
                title={data ? data?.label : 'Tables'}
                sidebar={<ExploreSideBar />}
                withFullHeight
                withPaddedContent
            >
                <Explorer />
            </Page>
        );
    },
);

const ExplorerPage: FC<{
    explorerUrlState?: ExplorerReduceState['unsavedChartVersion'] | undefined;
}> = ({ explorerUrlState: testing }) => {
    const explorerUrlState = useExplorerUrlState(testing);
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { user } = useApp();

    const dateZoomGranularity = useDateZoomGranularitySearch();

    const queryResults = useQueryResults({ dateZoomGranularity });

    const cannotViewProject = user.data?.ability?.cannot(
        'view',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
    const cannotManageExplore = user.data?.ability?.cannot(
        'manage',
        subject('Explore', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    if (cannotViewProject || cannotManageExplore) {
        return <ForbiddenPanel />;
    }

    return (
        <ExplorerProvider
            isEditMode={true}
            initialState={explorerUrlState}
            queryResults={queryResults}
        >
            <ExplorerWithUrlParams
                explorerUrlState={testing ? explorerUrlState : undefined}
            />
        </ExplorerProvider>
    );
};

export default ExplorerPage;
