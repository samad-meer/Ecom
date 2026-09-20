import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

/**
 * Crash reporting.
 *
 * The error boundary stops a render error taking the whole app down, but
 * nothing about it reaches us — `console.error` goes to a log on a phone
 * nobody is reading. This is the other half: the report actually arrives.
 *
 * It also covers what the boundary cannot. A boundary only catches errors
 * thrown *during render*; a failure in an async handler, an unhandled promise
 * rejection or a native module crash bypasses it entirely and still kills the
 * app. Sentry hooks the global handlers, so those are captured too.
 */

const dsn = (Constants.expoConfig?.extra?.sentryDsn as string | undefined) ?? '';

/** False when no DSN is configured — callers use it to stay quiet rather than throw. */
export const isCrashReportingEnabled = Boolean(dsn);

export function initCrashReporting(): void {
  // No DSN is a valid state, not an error: local development and any build made
  // before the DSN was issued both run without one. Reporting is a diagnostic,
  // and a diagnostic must never be the reason an app fails to start.
  if (!dsn) return;

  Sentry.init({
    dsn,
    // Ties each report to the build it came from, so "fixed in 1.0.1" is
    // checkable rather than hopeful.
    release: Constants.expoConfig?.version ?? 'unknown',
    // __DEV__ builds would otherwise flood the dashboard with errors from code
    // that is being actively edited.
    enabled: !__DEV__,
    // Breadcrumbs are what make a report actionable: the screens and taps that
    // led up to the crash, not just where it landed.
    maxBreadcrumbs: 50,
    // Performance tracing is off. It samples every navigation and request, and
    // on the metered connections riders use that is bandwidth spent on data
    // nobody has asked for yet. Crashes are the thing worth knowing about.
    tracesSampleRate: 0,
  });
}

/**
 * Report an error that has already been handled.
 *
 * `context` is anything that makes the report readable later — the order id,
 * the screen, what the user was doing.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!dsn) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/**
 * Attach the signed-in user to subsequent reports.
 *
 * Username only, never email or phone: it is enough to tell whether one rider
 * hits a bug or fifty do, and a crash dashboard is not a place to accumulate
 * customer contact details.
 */
export function identifyUser(user: { id: number; username: string } | null): void {
  if (!dsn) return;
  Sentry.setUser(user ? { id: String(user.id), username: user.username } : null);
}
