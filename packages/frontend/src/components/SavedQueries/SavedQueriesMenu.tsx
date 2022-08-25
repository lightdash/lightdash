import { Card, Divider, H3, Menu, MenuDivider, Text } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { Space } from '@lightdash/common';
import React, { Dispatch, SetStateAction } from 'react';

type SavedQueriesMenuProps = {
    data: Space[] | undefined;
    setSelectedMenu: Dispatch<SetStateAction<string | undefined>>;
    selectedMenu: string | undefined;
};

const SavedQueriesMenu = (props: SavedQueriesMenuProps) => {
    const { data, selectedMenu, setSelectedMenu } = props;
    return (
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
                    <Text>Select a space to start exploring your charts</Text>
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
                        <MenuItem2
                            active={saved.uuid === selectedMenu}
                            text={saved.name}
                            onClick={() => setSelectedMenu(saved.uuid)}
                        />

                        <MenuDivider />
                    </React.Fragment>
                ))}
            </Menu>
        </Card>
    );
};
export default SavedQueriesMenu;
