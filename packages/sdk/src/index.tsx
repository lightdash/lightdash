import { MantineIcon, MantineProvider } from '@lightdash/frontend';
import { IconHome } from '@tabler/icons-react';

function App() {
    return (
        <>
            <div>test</div>
            <MantineProvider>
                <MantineIcon icon={IconHome} />
            </MantineProvider>
        </>
    );
}

export default App;
