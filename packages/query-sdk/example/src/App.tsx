import { LightdashProvider, type LightdashUser } from '@lightdash/query-sdk';
import { useEffect, useState } from 'react';
import { ConstructorChart } from './components/ConstructorChart';
import { DriverStandings } from './components/DriverStandings';
import { KpiCards } from './components/KpiCards';
import { TopPerformers } from './components/TopPerformers';
import { lightdash } from './lightdash';
import './App.css';

function UserGreeting() {
    const [user, setUser] = useState<LightdashUser | null>(null);
    useEffect(() => {
        lightdash.auth.getUser().then(setUser).catch(console.error);
    }, []);
    return (
        <span className="subtitle">
            {user ? `Hello, ${user.name}` : 'Loading...'}
        </span>
    );
}

function App() {
    return (
        <LightdashProvider client={lightdash}>
            <div className="dashboard">
                <div className="dashboard-header">
                    <h1>Formula 1</h1>
                    <span className="season">2025</span>
                    <UserGreeting />
                </div>
                <KpiCards />
                <div className="two-col">
                    <ConstructorChart />
                    <TopPerformers />
                </div>
                <div className="full-width">
                    <DriverStandings />
                </div>
            </div>
        </LightdashProvider>
    );
}

export default App;
