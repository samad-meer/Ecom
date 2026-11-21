import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  TextInput,
  ViewStyle,
} from 'react-native';

/**
 * A ScrollView that keeps the focused input above the keyboard.
 *
 * Deliberately NOT built on KeyboardAvoidingView. That component shrinks its
 * own height, which is only correct when the OS has *not* already resized the
 * window — and with `android.edgeToEdgeEnabled` you cannot rely on either
 * answer. Guessing wrong shrinks the viewport twice and leaves a dead strip of
 * background above the keypad.
 *
 * This works the other way round, and cannot produce that artefact:
 *
 *   1. It adds the keyboard's height as *padding inside the scroll content*.
 *      Extra padding is always scrollable space, never a gap in the layout, so
 *      it is harmless whether or not the window also resized.
 *   2. It measures the focused input's real position on screen and scrolls it
 *      up by however much the keyboard overlaps it. Screen coordinates are true
 *      under either behaviour, so no assumption about resizing is needed.
 *
 * No new dependency: react-native-keyboard-controller would be the heavier
 * answer, but it is a native module and would break Expo Go.
 */

type Props = ScrollViewProps & {
  /** Breathing room kept below the focused field. */
  extraBottomSpace?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export const KeyboardAwareScrollView = forwardRef<ScrollView, Props>(
  function KeyboardAwareScrollView(
    { contentContainerStyle, extraBottomSpace = 24, onScroll, ...rest },
    forwardedRef,
  ) {
    const innerRef = useRef<ScrollView | null>(null);
    const offsetY = useRef(0);
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    const setRefs = useCallback(
      (node: ScrollView | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    const handleScroll = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        offsetY.current = e.nativeEvent.contentOffset.y;
        onScroll?.(e);
      },
      [onScroll],
    );

    useEffect(() => {
      const reveal = (event: KeyboardEvent) => {
        const height = event.endCoordinates.height;
        setKeyboardHeight(height);

        // One frame later: the padding above has to be applied before the
        // scroll target means anything.
        requestAnimationFrame(() => {
          const input = TextInput.State.currentlyFocusedInput?.();
          const scroll = innerRef.current;
          if (!input || !scroll) return;

          input.measureInWindow((_x, y, _w, h) => {
            if (!Number.isFinite(y) || !Number.isFinite(h)) return;
            // The keyboard reports where its top edge is. Subtracting its height from
            // the window height was wrong on Android with edge-to-edge, where the
            // window and the keyboard disagree about the navigation bar, and the
            // last field of a form stayed behind the keys.
            const reportedTop = event.endCoordinates.screenY;
            const keyboardTop = Number.isFinite(reportedTop) && reportedTop > 0
              ? reportedTop
              : Dimensions.get('window').height - height;
            // How far the field's bottom edge sits below the keyboard's top.
            const overlap = y + h + extraBottomSpace - keyboardTop;
            if (overlap > 0) {
              scroll.scrollTo({ y: offsetY.current + overlap, animated: true });
            }
          });
        });
      };

      const hide = () => setKeyboardHeight(0);

      // iOS gets the 'Will' pair so the scroll rides along with the keyboard
      // animation; Android only ever fires the 'Did' pair.
      const showSub = Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
        reveal,
      );
      // Android re-fires 'DidShow' when the keyboard resizes (switching to the
      // emoji or number layout), so the focused field is re-revealed for free.
      const hideSub = Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
        hide,
      );
      return () => {
        showSub.remove();
        hideSub.remove();
      };
    }, [extraBottomSpace]);

    return (
      <ScrollView
        ref={setRefs}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        scrollEventThrottle={16}
        {...rest}
        onScroll={handleScroll}
        contentContainerStyle={[
          contentContainerStyle,
          { paddingBottom: extraBottomSpace + keyboardHeight },
        ]}
      />
    );
  },
);

/**
 * For a sheet inside a <Modal>. A Modal is its own window, so the stack's
 * bottom padding does not reach it and the last button slides under the
 * navigation bar. This adds that inset to the scroll's bottom space.
 */
export const SheetScrollView = forwardRef<ScrollView, Props>(function SheetScrollView(
  { extraBottomSpace = 24, ...rest },
  ref,
) {
  const insets = useSafeAreaInsets();
  return <KeyboardAwareScrollView ref={ref} {...rest} extraBottomSpace={extraBottomSpace + insets.bottom} />;
});
