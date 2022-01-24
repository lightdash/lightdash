import {
    Button,
    Divider,
    H3,
    InputGroup,
    Menu,
    MenuDivider,
    MenuItem,
    NonIdealState,
    Text,
} from '@blueprintjs/core';
import Fuse from 'fuse.js';
import React, { useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useToggle } from 'react-use';
import { useExplores } from '../../../hooks/useExplores';
import { useApp } from '../../../providers/AppProvider';
import { useExplorer } from '../../../providers/ExplorerProvider';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import AboutFooter from '../../AboutFooter';
import { ExploreMenuItem } from '../../ExploreMenuItem';
import { ShowErrorsButton } from '../../ShowErrorsButton';
import ExplorePanel from '../ExplorePanel/index';
import {
    FooterWrapper,
    MenuWrapper,
    SearchWrapper,
    SideBarDescription,
    SideBarTitleWrapper,
    SwitchFilter,
} from './ExploreSideBar.styles';

const SideBarLoadingState = () => (
    <Menu large style={{ flex: 1 }}>
        {[0, 1, 2, 3, 4].map((idx) => (
            <React.Fragment key={idx}>
                <MenuItem className="bp3-skeleton" text="Hello" />
                <MenuDivider />
            </React.Fragment>
        ))}
    </Menu>
);
const BasePanel = () => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { errorLogs } = useApp();
    const [search, setSearch] = useState<string>('');
    const [filterExplores, toggleFilterExplores] = useToggle(true);
    const exploresResult = useExplores(filterExplores);

    const filteredTables = useMemo(() => {
        if (exploresResult.data) {
            if (search !== '') {
                return new Fuse(Object.values(exploresResult.data), {
                    keys: ['name', 'description'],
                })
                    .search(search)
                    .map((res) => res.item);
            }
            return Object.values(exploresResult.data);
        }
        return [];
    }, [exploresResult.data, search]);

    if (exploresResult.data) {
        return (
            <>
                <div>
                    <SideBarTitleWrapper>
                        <H3>Tables</H3>
                    </SideBarTitleWrapper>
                    <SideBarDescription>
                        <Text>
                            Select a table to start exploring your metrics
                        </Text>
                        <SearchWrapper>
                            <InputGroup
                                leftIcon="search"
                                rightElement={
                                    <Button
                                        minimal
                                        icon="cross"
                                        onClick={() => setSearch('')}
                                    />
                                }
                                placeholder="Search tables"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </SearchWrapper>
                        <SwitchFilter
                            checked={filterExplores}
                            label="See unlisted tables"
                            onChange={toggleFilterExplores}
                        />
                    </SideBarDescription>
                    <Divider />
                </div>

                <MenuWrapper>
                    {filteredTables
                        .sort((a, b) => a.label.localeCompare(b.label))
                        .map((explore) => (
                            <React.Fragment key={explore.name}>
                                <ExploreMenuItem
                                    explore={explore}
                                    onClick={() => {
                                        history.push(
                                            `/projects/${projectUuid}/tables/${explore.name}`,
                                        );
                                    }}
                                />
                                <MenuDivider />
                            </React.Fragment>
                        ))}
                </MenuWrapper>
            </>
        );
    }
    if (exploresResult.status === 'loading') {
        return <SideBarLoadingState />;
    }
    if (exploresResult.status === 'error') {
        return (
            <NonIdealState
                icon="error"
                title="Could not load explores"
                description="Check error logs for more details"
                action={
                    <ShowErrorsButton
                        errorLogs={errorLogs.errorLogs}
                        setErrorLogsVisible={errorLogs.setErrorLogsVisible}
                    />
                }
            />
        );
    }
    return (
        <NonIdealState icon="warning-sign" title="Could not load explores" />
    );
};

const ExploreSideBar = () => {
    const {
        state: { tableName },
        actions: { reset },
    } = useExplorer();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const history = useHistory();
    const onBack = () => {
        reset();
        history.push({
            pathname: `/projects/${projectUuid}/tables`,
        });
    };

    return (
        <TrackSection name={SectionName.SIDEBAR}>
            <FooterWrapper>
                {!tableName ? <BasePanel /> : <ExplorePanel onBack={onBack} />}
                <AboutFooter minimal />
            </FooterWrapper>
        </TrackSection>
    );
};

export default ExploreSideBar;
