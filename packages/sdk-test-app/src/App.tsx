import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { examples } from './examples/examples';
import { useEmbedConfig } from './hooks/useEmbedConfig';
import { HomePage } from './pages/HomePage';

function App() {
    const embedConfig = useEmbedConfig();

    return (
        <BrowserRouter>
            <Routes>
                <Route
                    path="/"
                    element={<HomePage embedConfig={embedConfig} />}
                />
                {examples.map((example) => (
                    <Route
                        key={example.slug}
                        path={example.path}
                        element={
                            <example.component embedConfig={embedConfig} />
                        }
                    />
                ))}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
