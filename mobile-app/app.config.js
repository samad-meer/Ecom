require('dotenv').config();

// Maps SDK for Android reads the key from the native manifest, so it has to be
// resolved here rather than at runtime. An EMPTY key must stay empty: writing
// `apiKey: ""` into the manifest makes the SDK fail authorization on a map the
// admin can still see, whereas omitting the block entirely leaves the app in a
// known state that the JS side detects and degrades from.
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || "";

module.exports = {
  expo: {
    // User-facing app label — this is what appears under the icon on the home
    // screen and in the app switcher. `slug` stays as-is: it identifies the
    // project on EAS and changing it would orphan the existing builds.
    name: "Century Sip",
    slug: "mobile-app",
    owner: "samadfastnexa",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    jsEngine: "hermes",
    newArchEnabled: false,
    // Custom URL scheme — expo-auth-session needs this to catch Google's
    // redirect back into the app. Without it the browser opens, the user signs
    // in, and nothing ever returns. Changing it invalidates existing OAuth
    // redirect URIs, so keep it stable once released.
    scheme: "centurysip",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      supportsTablet: true,
      // Required before an iOS OAuth client can be created in Google Cloud.
      // Permanent once published to the App Store — do not change after release.
      bundleIdentifier: "com.centurysip.store",
      // Only emitted when a key exists — `googleMapsApiKey: ""` makes the iOS
      // Maps SDK fail authorization at runtime instead of simply being absent.
      ...(googleMapsApiKey ? { config: { googleMapsApiKey } } : {})
    },
    android: {
      // Permanent once published to the Play Store — a rename after release
      // means a brand-new listing with no installs, reviews or ratings.
      package: "com.centurysip.store",
      // Firebase config — required so the native app can initialize Firebase
      // and obtain an FCM push token. Must be rebuilt after adding this.
      googleServicesFile: "./google-services.json",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      // Riders are tracked 24/7, which on Android means a foreground service
      // plus the "Allow all the time" background grant. The expo-location
      // plugin below adds these too; listing them here keeps the requirement
      // visible to anyone auditing what the app asks for.
      permissions: [
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_BACKGROUND_LOCATION",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_LOCATION"
      ],
      ...(googleMapsApiKey ? { config: { googleMaps: { apiKey: googleMapsApiKey } } } : {})
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-web-browser",
      "expo-notifications",
      // Crash reporting. The plugin's job is source maps: without it every
      // stack trace is a minified bundle offset, which tells you nothing.
      "@sentry/react-native",
      // Backs the "remember me" password with the Keychain / Keystore. The
      // plugin's default also excludes those entries from Android auto-backup,
      // which matters because a restored ciphertext cannot be decrypted on a
      // different device and would surface as a corrupt saved login.
      "expo-secure-store",
      // The iOS strings are what an App Store reviewer reads before deciding
      // whether "always" is justified, so they name the job (delivery
      // dispatch) rather than describing the permission back to the user.
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Century Sip uses your location to show dispatch where your delivery van is while you are on shift.",
          locationAlwaysAndWhenInUsePermission:
            "Century Sip shares your delivery van's location with dispatch so customers can be told when their water is arriving. Riders are tracked only while their rider account is signed in.",
          locationAlwaysPermission:
            "Century Sip shares your delivery van's location with dispatch so customers can be told when their water is arriving. Riders are tracked only while their rider account is signed in.",
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
          isIosBackgroundLocationEnabled: true
        }
      ]
    ],
    extra: {
      // Full API URL wins and defaults to the live backend, so the app uses
      // the deployed API out of the box. For local dev against a LAN backend,
      // set API_HOST in .env (then host:port is used instead of the live URL).
      apiUrl:
        process.env.API_URL ||
        (process.env.API_HOST ? null : "https://century.zipnixtechnologies.com/api"),
      apiHost: process.env.API_HOST || null,
      apiPort: process.env.API_PORT || "8002",
      // Google OAuth client IDs (Google Cloud Console → Credentials, project
      // ecom-c08aa). These are public identifiers, not secrets, but they differ
      // per environment so they come from .env rather than being committed.
      googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID || "",
      googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || "",
      googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID || "",
      // Maps SDK key. Same value as android.config.googleMaps.apiKey above —
      // the JS side reads this copy to decide whether to render a map at all.
      googleMapsApiKey,
      // Sentry DSN. Not a secret (it only accepts events, it cannot read them),
      // but it is environment-specific, so it comes from the environment. Empty
      // disables reporting entirely rather than failing — a missing DSN must
      // never be able to stop the app starting.
      sentryDsn: process.env.SENTRY_DSN || "",
      // EAS project ID — required for push tokens (project @samadfastnexa/mobile-app).
      eas: {
        projectId: process.env.EAS_PROJECT_ID || "32a63efa-d33b-4d87-97b9-e0b590501945"
      }
    }
  }
};
