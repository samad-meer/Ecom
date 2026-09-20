import { registerRootComponent } from 'expo';

// First import on purpose: Sentry has to be listening before any other module
// runs, or an error thrown while the app is still starting goes unreported —
// and startup crashes are the ones users never work around.
import { initCrashReporting } from './src/services/crashReporting';

initCrashReporting();

// Imported for its side effect: the module defines the background location task
// at import time. Android restarts the JS bundle headlessly to deliver a
// location batch, and nothing renders in that context — so the definition has
// to run from the entry point, before React is involved at all.
import './src/services/locationService';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
