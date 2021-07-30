import React, { FC, useEffect, useMemo, useState } from 'react';
import {
    Classes,
    Card,
    Divider,
    H3,
    H5,
    Menu,
    MenuDivider,
    MenuItem,
    Text,
    Button,
    ButtonGroup,
    NonIdealState,
    Dialog,
    Spinner,
} from '@blueprintjs/core';
import { useQuery } from 'react-query';
import { ApiError, Space, SpaceQuery } from 'common';
import { useHistory } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';
import { useDeleteMutation } from '../hooks/useSavedQuery';
import { UpdateSavedQueryModal } from '../components/SaveQueryModal';

const getSpaces = async () =>
    lightdashApi<Space[]>({
        url: `/spaces`,
        method: 'GET',
        body: undefined,
    });

const SavedListItem: FC<{ savedQuery: SpaceQuery }> = ({ savedQuery }) => {
    const history = useHistory();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
    const { mutate, isLoading: isDeleting } = useDeleteMutation();

    return (
        <Card
            elevation={0}
            style={{
                display: 'flex',
                flexDirection: 'column',
                marginBottom: '20px',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                }}
            >
                <H5 style={{ margin: 0, flex: 1 }}>{savedQuery.name}</H5>
                <ButtonGroup>
                    <Button
                        icon="document-open"
                        intent="primary"
                        outlined
                        onClick={() => {
                            history.push({
                                pathname: `/saved/${savedQuery.uuid}`,
                            });
                        }}
                        text="Open"
                    />
                    <Button
                        icon="edit"
                        intent="warning"
                        outlined
                        text="Edit"
                        onClick={() => setIsUpdateDialogOpen(true)}
                    />
                    <Button
                        icon="delete"
                        intent="danger"
                        outlined
                        onClick={() => setIsDeleteDialogOpen(true)}
                        text="Delete"
                    />
                </ButtonGroup>
            </div>
            <Dialog
                isOpen={isDeleteDialogOpen}
                icon="cog"
                onClose={() =>
                    !isDeleting ? setIsDeleteDialogOpen(false) : undefined
                }
                title="Settings"
                lazy
                canOutsideClickClose={false}
            >
                <div className={Classes.DIALOG_BODY}>
                    <p>Are you sure you want to delete this chart ?</p>
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button
                            disabled={isDeleting}
                            onClick={() => setIsDeleteDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={isDeleting}
                            intent="danger"
                            onClick={() => mutate(savedQuery.uuid)}
                        >
                            Delete
                        </Button>
                    </div>
                </div>
            </Dialog>
            {isUpdateDialogOpen && (
                <UpdateSavedQueryModal
                    isOpen={isUpdateDialogOpen}
                    savedQueryId={savedQuery.uuid}
                    onClose={() => setIsUpdateDialogOpen(false)}
                />
            )}
        </Card>
    );
};

const Saved: FC = () => {
    const { rudder } = useApp();
    const [selectedMenu, setSelectedMenu] = useState<string>();

    const { isLoading, data } = useQuery<Space[], ApiError>({
        queryKey: ['spaces'],
        queryFn: getSpaces,
    });

    const savedQueries: SpaceQuery[] = useMemo(
        () => data?.find(({ uuid }) => uuid === selectedMenu)?.queries || [],
        [selectedMenu, data],
    );

    useEffect(() => {
        if (!selectedMenu && data && data.length > 0) {
            setSelectedMenu(data[0].uuid);
        }
    }, [selectedMenu, data]);

    useEffect(() => {
        rudder.page(undefined, 'saved');
    }, [rudder]);

    if (isLoading) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading charts" icon={<Spinner />} />
            </div>
        );
    }

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'nowrap',
                justifyContent: 'stretch',
                alignItems: 'flex-start',
            }}
        >
            <Card
                style={{
                    height: 'calc(100vh - 50px)',
                    width: '400px',
                    overflow: 'hidden',
                    position: 'sticky',
                    top: '50px',
                }}
                elevation={1}
            >
                <div style={{ height: '100px' }}>
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
                        <H3>Saved charts</H3>
                    </div>
                    <div style={{ padding: '10px' }}>
                        <Text>
                            Select a space to start exploring your charts
                        </Text>
                    </div>
                    <Divider />
                </div>
                <Menu
                    style={{
                        flex: '1',
                        overflow: 'auto',
                    }}
                >
                    {(data || []).map((saved) => (
                        <React.Fragment key={saved.uuid}>
                            <MenuItem
                                active={saved.uuid === selectedMenu}
                                text={saved.name}
                                onClick={() => setSelectedMenu(saved.uuid)}
                            />
                            <MenuDivider />
                        </React.Fragment>
                    ))}
                </Menu>
            </Card>
            <div
                style={{
                    padding: '20px',
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    alignItems: 'stretch',
                }}
            >
                {savedQueries.map((savedQuery) => (
                    <SavedListItem
                        key={savedQuery.uuid}
                        savedQuery={savedQuery}
                    />
                ))}
                {savedQueries.length <= 0 && (
                    <div style={{ padding: '50px 0' }}>
                        <NonIdealState
                            title="No results available"
                            icon="search"
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default Saved;
