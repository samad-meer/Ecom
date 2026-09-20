import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Re-read a screen's data when the user navigates back to it.
 *
 * Admin lists load once on mount, so returning from a detail screen that just
 * changed something — an order's status, its rider, whether it is hidden —
 * left the row showing the old value until a manual pull-to-refresh. The change
 * had saved; the list simply had not been told.
 *
 * Two details this gets right that a bare useFocusEffect does not:
 *
 *   - The FIRST focus is skipped. It fires on mount, where the screen's own
 *     load effect is already running, and two identical requests would race.
 *   - The callback identity is held in a ref, so a `load` that is rebuilt on
 *     every filter change does not re-trigger the focus effect. Without this,
 *     changing a filter fires both the load effect and the focus effect.
 *
 * Pass a SILENT refetch — one that does not raise the full-screen spinner —
 * or the list will flash blank every time the user comes back.
 */
export function useRefetchOnFocus(refetch: () => void | Promise<void>, enabled = true) {
  const latest = useRef(refetch);
  useEffect(() => {
    latest.current = refetch;
  });

  const isFirstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      if (enabled) void latest.current();
    }, [enabled]),
  );
}
