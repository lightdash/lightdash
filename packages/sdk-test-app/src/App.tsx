import { examples } from './examples/examples';
import { useEmbedConfig } from './hooks/useEmbedConfig';
import { HomePage } from './pages/HomePage';
import { Link, useRouter } from './router';

function NotFoundPage() {
    return (
        <main style={{ padding: '32px', fontFamily: 'Inter, sans-serif' }}>
            <p style={{ marginBottom: '12px' }}>Example not found.</p>
            <Link href="/">Back to examples</Link>
        </main>
    );
}

export default function App() {
    const embedConfig = useEmbedConfig();
    const { currentPath } = useRouter();

    if (currentPath === '/') {
        return <HomePage embedConfig={embedConfig} />;
    }

    const example = examples.find((entry) => entry.path === currentPath);

    if (example) {
        const ExamplePage = example.component;

        return <ExamplePage embedConfig={embedConfig} />;
    }
    return <NotFoundPage />;
}
