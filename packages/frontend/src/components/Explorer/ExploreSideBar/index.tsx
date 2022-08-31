import {
    Button,
    InputGroup,
    Menu,
    MenuDivider,
    NonIdealState,
} from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import Fuse from 'fuse.js';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useToggle } from 'react-use';
import { useExplores } from '../../../hooks/useExplores';
import { useErrorLogs } from '../../../providers/ErrorLogsProvider';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { TrackSection } from '../../../providers/TrackingProvider';
import { SectionName } from '../../../types/Events';
import { ExploreMenuItem } from '../../ExploreMenuItem';
import { ShowErrorsButton } from '../../ShowErrorsButton';
import ExplorePanel from '../ExplorePanel';
import { TableDivider } from '../ExplorePanel/ExplorePanel.styles';
import {
    FooterWrapper,
    FormField,
    MenuWrapper,
    StyledBreadcrumb,
    SwitchFilter,
} from './ExploreSideBar.styles';

const SideBarLoadingState = () => (
    <Menu large style={{ flex: 1 }}>
        {[0, 1, 2, 3, 4].map((idx) => (
            <React.Fragment key={idx}>
                <MenuItem2 className="bp4-skeleton" />
                <MenuDivider />
            </React.Fragment>
        ))}
    </Menu>
);
const BasePanel = () => {
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const errorLogs = useErrorLogs();
    const [search, setSearch] = useState<string>('');
    const [filterExplores, toggleFilterExplores] = useToggle(true);
    const exploresResult = useExplores(filterExplores);

    const filteredTables = useMemo(() => {
        const validSearch = search ? search.toLowerCase() : '';
        if (exploresResult.data) {
            if (validSearch !== '') {
                return new Fuse(Object.values(exploresResult.data), {
                    keys: ['label'],
                    ignoreLocation: true,
                    threshold: 0.3,
                })
                    .search(validSearch)
                    .map((res) => res.item);
            }
            return Object.values(exploresResult.data);
        }
        return [];
    }, [exploresResult.data, search]);

    if (exploresResult.data) {
        return (
            <>
                <StyledBreadcrumb items={[{ text: 'Tables' }]} />

                <TableDivider />

                <FormField>
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
                </FormField>

                <FormField>
                    <SwitchFilter
                        checked={!filterExplores}
                        label="Show hidden tables"
                        onChange={toggleFilterExplores}
                    />
                </FormField>

                <MenuWrapper>
                    <MenuDivider />

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

const ExploreSideBar = memo(() => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const clear = useExplorerContext((context) => context.actions.clear);
    const history = useHistory();

    const onBack = useCallback(() => {
        clear();
        history.push(`/projects/${projectUuid}/tables`);
    }, [clear, history, projectUuid]);

    return (
        <TrackSection name={SectionName.SIDEBAR}>
            <FooterWrapper>
                {!tableName ? <BasePanel /> : <ExplorePanel onBack={onBack} />}
            </FooterWrapper>
        </TrackSection>
    );
});

export default ExploreSideBar;
