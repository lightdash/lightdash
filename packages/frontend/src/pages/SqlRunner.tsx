import React, { FC, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Tooltip2 } from '@blueprintjs/popover2';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import {
    Button,
    Card,
    NonIdealState,
    PopoverPosition,
} from '@blueprintjs/core';
import { friendlyName } from 'common';
import AceEditor from 'react-ace';
import { CollapsableCard } from '../components/common/CollapsableCard';
import { useSqlQueryMutation } from '../hooks/useSqlQuery';
import { Section } from '../providers/TrackingProvider';
import { SectionName } from '../types/Events';
import { RefreshServerButton } from '../components/RefreshServerButton';
import { BigButton } from '../components/common/BigButton';
import { ResultsTable as Table } from '../components/ResultsTable/ResultsTable';

const Wrapper = styled('div')`
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: stretch;
    align-items: flex-start;
`;

const Sidebar = styled(Card)`
    height: calc(100vh - 50px);
    width: 400px;
    margin-right: 10px;
    overflow: hidden;
    position: sticky;
    top: 50px;
`;

const ContentSection = styled('div')`
    padding: 10px 10px;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: stretch;
`;

const Divider = styled('div')`
    padding-top: 10px;
`;

const RunQueryButton: FC<{ isLoading: boolean; onSubmit: () => void }> = ({
    onSubmit,
    isLoading,
}) => (
    <BigButton
        intent="primary"
        style={{ width: 150, marginRight: '10px' }}
        onClick={onSubmit}
        loading={isLoading}
    >
        Run query
    </BigButton>
);

const ResultsIdleState: FC<React.ComponentProps<typeof RunQueryButton>> = (
    props,
) => (
    <Section name={SectionName.EMPTY_RESULTS_TABLE}>
        <div style={{ padding: '50px 0' }}>
            <NonIdealState
                description="Click run query to see your results"
                action={<RunQueryButton {...props} />}
            />
        </div>
    </Section>
);

const SQL_PLACEHOLDER =
    'SELECT * FROM "postgres"."jaffle"."customers" LIMIT 500';

const SqlRunnerPage = () => {
    const [copied, setCopied] = useState<boolean>(false);
    const [sql, setSql] = useState<string>(SQL_PLACEHOLDER);
    const [columnsOrder, setColumnsOrder] = useState<string[]>([]);
    const { isIdle, isLoading, data, mutate } = useSqlQueryMutation();

    const dataColumns = useMemo(() => {
        if (data && data.rows.length > 0) {
            return Object.keys(data.rows[0]).map((key) => ({
                Header: <span>{friendlyName(key)}</span>,
                accessor: key,
                type: 'dimension',
            }));
        }
        return [];
    }, [data]);

    const onSubmit = () => {
        mutate(sql);
    };

    return (
        <Wrapper>
            <Sidebar elevation={1} />
            <ContentSection>
                <Section name={SectionName.EXPLORER_TOP_BUTTONS}>
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'row',
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                        }}
                    >
                        <RunQueryButton
                            onSubmit={onSubmit}
                            isLoading={isLoading}
                        />
                        <RefreshServerButton />
                    </div>
                </Section>
                <Divider />
                <CollapsableCard title="SQL" isOpenByDefault>
                    <div
                        style={{
                            padding: 10,
                            position: 'relative',
                        }}
                    >
                        <AceEditor
                            readOnly={isLoading}
                            value={sql}
                            height="300px"
                            width="100%"
                            editorProps={{ $blockScrolling: true }}
                            enableBasicAutocompletion
                            enableLiveAutocompletion
                            onChange={(value: string) => {
                                setSql(value);
                                setCopied(false);
                            }}
                        />
                        <div
                            style={{
                                position: 'absolute',
                                bottom: 0,
                                right: 0,
                            }}
                        >
                            <Tooltip2
                                isOpen={copied}
                                content="Copied to clipboard!"
                                intent="success"
                                position={PopoverPosition.RIGHT}
                            >
                                <CopyToClipboard
                                    text={sql}
                                    onCopy={() => setCopied(true)}
                                >
                                    <Button minimal icon="clipboard" />
                                </CopyToClipboard>
                            </Tooltip2>
                        </div>
                    </div>
                </CollapsableCard>
                <Divider />
                <CollapsableCard title="Results" isOpenByDefault>
                    <Table
                        data={data?.rows || []}
                        dataColumns={dataColumns}
                        loading={isLoading}
                        idle={isIdle}
                        dataColumnOrder={columnsOrder}
                        onColumnOrderChange={setColumnsOrder}
                        idleState={
                            <ResultsIdleState
                                onSubmit={onSubmit}
                                isLoading={isLoading}
                            />
                        }
                    />
                </CollapsableCard>
            </ContentSection>
        </Wrapper>
    );
};

export default SqlRunnerPage;
