import Constants from 'expo-constants';

/* ============================================================
 *  🔧  BACKEND TOGGLE  —  the only switch you need
 *  ------------------------------------------------------------
 *    USE_LOCAL = true   →  the WHOLE app uses your LOCAL backend
 *    USE_LOCAL = false  →  the WHOLE app uses the LIVE server
 *
 *  This wins over anything in .env, so flipping it here is all
 *  you have to do (then restart Metro:  npx expo start -c).
 * ============================================================ */
// `__DEV__` guard is deliberate and must stay. This flag used to be a plain
// `true`, which meant a release build shipped pointing at a LAN address that
// exists on nobody's phone — the app would install and then fail every request.
// Now it can only ever take effect in a development build; production always
// resolves the live API no matter what this is set to.
const USE_LOCAL = __DEV__ && true;

// Used only when USE_LOCAL is true. Point at your PC on the LAN.
// Find your IP with:  ipconfig   (IPv4 Address, e.g. 192.168.1.5)
const LOCAL_HOST = process.env.API_HOST || '192.168.10.6';
const LOCAL_PORT = process.env.API_PORT || '8002';
/* ============================================================ */

const LIVE_API_URL = 'https://century.zipnixtechnologies.com/api';

/**
 * Resolve the base API URL.
 *
 *   - USE_LOCAL=true  → always http://LOCAL_HOST:LOCAL_PORT/api
 *   - USE_LOCAL=false → an explicit API_URL from .env (used by EAS
 *                       production builds) if present, else the live backend.
 */
const resolveApiUrl = (): string => {
    if (USE_LOCAL) {
        return `http://${LOCAL_HOST}:${LOCAL_PORT}/api`;
    }

    const fullUrl = Constants.expoConfig?.extra?.apiUrl;
    if (fullUrl && String(fullUrl) !== 'null') {
        return String(fullUrl).replace(/\/+$/, '');
    }
    return LIVE_API_URL;
};

export const API_URL = resolveApiUrl();

if (__DEV__) {
    console.log(`🌐 API URL: ${API_URL}  (${USE_LOCAL ? 'LOCAL' : 'LIVE'})`);
}
