import { useState } from 'react';
import { ClaimView } from './screens/ClaimView';
import { PolicyView } from './screens/PolicyView';

type Screen = 'policy' | 'claim';

export function App() {
  const [screen, setScreen] = useState<Screen>('policy');

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
        </nav>
      </header>
      {screen === 'policy' ? <PolicyView /> : <ClaimView />}
    </main>
  );
}
