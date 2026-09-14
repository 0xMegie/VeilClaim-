import { useState } from 'react';
import { DevPanel } from './dev/DevPanel';
import { ClaimView } from './screens/ClaimView';
import { PolicyView } from './screens/PolicyView';

type Screen = 'policy' | 'claim' | 'dev';

const showDev = import.meta.env.DEV;

export function App() {
  const [screen, setScreen] = useState<Screen>(showDev ? 'dev' : 'policy');

  return (
    <main className="app">
      <header className="app-header">
        <h1>VeilClaim</h1>
        <nav>
          <button aria-pressed={screen === 'policy'} onClick={() => setScreen('policy')}>
            Policy
          </button>
          <button aria-pressed={screen === 'claim'} onClick={() => setScreen('claim')}>
            Claim
          </button>
          {showDev && (
            <button aria-pressed={screen === 'dev'} onClick={() => setScreen('dev')}>
              Dev
            </button>
          )}
        </nav>
      </header>
      {screen === 'policy' && <PolicyView />}
      {screen === 'claim' && <ClaimView />}
      {showDev && screen === 'dev' && <DevPanel />}
    </main>
  );
}
