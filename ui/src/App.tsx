import { useState } from 'react';
import { DevPanel } from './dev/DevPanel';
import { VeilClaimProvider } from './midnight/VeilClaimContext';
import { ClaimView } from './screens/ClaimView';
import { PolicyView } from './screens/PolicyView';

type Screen = 'policy' | 'claim' | 'dev';

const showDev = import.meta.env.DEV;

const screenFromHash = (): Screen => {
  const hash = window.location.hash.slice(1);
  return hash === 'claim' || (hash === 'dev' && showDev) ? hash : 'policy';
};

export function App() {
  const [screen, setScreenState] = useState<Screen>(screenFromHash);

  const setScreen = (next: Screen) => {
    window.history.replaceState(null, '', `#${next}`);
    setScreenState(next);
  };

  return (
    <VeilClaimProvider>
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
    </VeilClaimProvider>
  );
}
