import { Menu, MenuDivider, MenuItem } from '@blueprintjs/core';
import React from 'react';

const SideBarLoadingState = () => (
    <Menu large style={{ flex: 1 }}>
        {[0, 1, 2, 3, 4].map((idx) => (
            <React.Fragment key={idx}>
                <MenuItem className="bp4-skeleton" />
                <MenuDivider />
            </React.Fragment>
        ))}
    </Menu>
);

export default SideBarLoadingState;
