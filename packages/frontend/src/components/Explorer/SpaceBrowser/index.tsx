import React, { FC } from 'react';
import { useSpaces } from '../../../hooks/useSpaces';
import LatestCard from '../../Home/LatestCard';
import {
    CreateNewButton,
    SpaceBrowserWrapper,
    SpaceLinkButton,
    SpaceListWrapper,
    SpaceTitle,
} from './SpaceBrowser.styles';

const SpaceBrowser: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data, isLoading } = useSpaces(projectUuid);
    /*
    if (isLoading || data === undefined) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading charts" icon={<Spinner />} />
            </div>
        );
    }*/

    /*  const dataList: SpaceBasicDetails[] = !data ? [] : data.map((space) => {
        const lastUpdatedChart = space.queries.reduce((acc, chart) =>
            chart && acc.updatedAt < chart.updatedAt ? acc : chart,
        );

        return {
            name: space.name,
            uuid: space.uuid,
            updatedAt: lastUpdatedChart.updatedAt,
            updatedByUser: lastUpdatedChart.updatedByUser,
        };
    });*/
    return (
        <SpaceBrowserWrapper>
            {/* <ActionCardList
                title="Browse spaces"
                useUpdate={useUpdateMutation}
                useDelete={useDeleteMutation()}
                dataList={dataList}
                getURL={(space: {uuid: string}) => {
                    return `/projects/${projectUuid}/spaces/${space.uuid}`;
                }}
                ModalContent={SpaceForm}
            />*/}

            <LatestCard
                isLoading={isLoading}
                title="Browse spaces"
                headerAction={
                    <CreateNewButton
                        minimal
                        loading={isLoading}
                        intent="primary"
                        onClick={
                            () => {} /*() =>
                    useCreateMutation.mutate({
                        name: DEFAULT_DASHBOARD_NAME,
                    })*/
                        }
                    >
                        + Create new
                    </CreateNewButton>
                }
            >
                <SpaceListWrapper>
                    {data &&
                        data.map(({ uuid, name }) => (
                            <SpaceLinkButton
                                key={uuid}
                                minimal
                                outlined
                                href={`/projects/${projectUuid}/spaces/${uuid}`}
                            >
                                <SpaceTitle>{name}</SpaceTitle>
                            </SpaceLinkButton>
                        ))}
                </SpaceListWrapper>
            </LatestCard>
        </SpaceBrowserWrapper>
    );
};

export default SpaceBrowser;
