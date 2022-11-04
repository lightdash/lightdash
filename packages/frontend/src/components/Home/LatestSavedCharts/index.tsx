import { AnchorButton } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { useSavedCharts } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import LinkButton from '../../common/LinkButton';
import ResourceList from '../../common/ResourceList';
import { SortDirection } from '../../common/ResourceList/ResourceTable';

interface Props {
    projectUuid: string;
}

const LatestSavedCharts: FC<Props> = ({ projectUuid }) => {
    const { user, health } = useApp();
    const history = useHistory();
    const isDemo = health.data?.mode === LightdashMode.DEMO;
    const { data: savedCharts = [] } = useSavedCharts(projectUuid);

    const userCanViewCharts = user.data?.ability.can(
        'view',
        subject('SavedChart', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const userCanManageCharts = user.data?.ability.can(
        'manage',
        subject('SavedChart', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const handleCreateChart = () => {
        history.push(`/projects/${projectUuid}/tables`);
    };

    return (
        <ResourceList
            resourceIcon="chart"
            resourceType="chart"
            resourceList={savedCharts}
            enableSorting={false}
            defaultSort={{
                updatedAt: SortDirection.DESC,
            }}
            showCount={false}
            getURL={({ uuid }) => `/projects/${projectUuid}/saved/${uuid}`}
            headerTitle="Recently updated charts"
            headerAction={
                savedCharts.length === 0 ? (
                    <AnchorButton
                        target="_blank"
                        text="Learn"
                        minimal
                        href="https://docs.lightdash.com/get-started/exploring-data/sharing-insights"
                    />
                ) : userCanViewCharts ? (
                    <LinkButton
                        text={`View all ${savedCharts.length}`}
                        minimal
                        intent="primary"
                        href={`/projects/${projectUuid}/saved`}
                    />
                ) : null
            }
            onClickCTA={
                !isDemo && userCanManageCharts ? handleCreateChart : undefined
            }
        />
    );
};

export default LatestSavedCharts;
