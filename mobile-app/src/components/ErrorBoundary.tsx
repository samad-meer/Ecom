import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { reportError } from '../services/crashReporting';

/**
 * Catches render errors so one bad screen does not take the whole app with it.
 *
 * Without this, any exception thrown while rendering unmounts the entire tree
 * and leaves a white screen with no text, no back button and no way out but
 * force-quitting — which for a rider mid-round means the delivery they were
 * recording is simply gone.
 *
 * It is not a substitute for a crash reporter: nothing here reaches us, so we
 * still only learn about a crash when someone rings up. Wiring Sentry into
 * componentDidCatch is the next step.
 */

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // The console line is for development, where Metro is watching. The report
    // is for production, where nobody is: without it we only learn about a
    // crash when a rider rings up to say the app closed.
    console.error('Unhandled render error:', error, info.componentStack);
    reportError(error, { componentStack: info.componentStack });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="warning" size={34} color="#FF9500" />
        </View>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          The screen could not be shown. Tap below to return to it — if it keeps
          happening, close the app fully and open it again.
        </Text>

        {/* The message is only shown in development. In production it would
            put a stack trace in front of a customer, which tells them nothing
            and looks broken. */}
        {__DEV__ && (
          <ScrollView style={styles.detail} contentContainerStyle={styles.detailInner}>
            <Text style={styles.detailText}>{error.message}</Text>
          </ScrollView>
        )}

        <TouchableOpacity
          style={styles.button}
          onPress={() => this.setState({ error: null })}
          activeOpacity={0.85}
        >
          <Ionicons name="refresh" size={17} color="#fff" />
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 32, backgroundColor: '#F4F6F8',
  },
  iconWrap: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: '#FFF4E0',
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  title: { fontSize: 19, fontWeight: '800', color: '#1a2530' },
  body: {
    fontSize: 14, color: '#5b6b7c', textAlign: 'center',
    lineHeight: 20, marginTop: 8,
  },
  detail: {
    maxHeight: 140, alignSelf: 'stretch', marginTop: 18,
    borderRadius: 10, backgroundColor: '#FFF7F7',
    borderWidth: 1, borderColor: '#F3C2C2',
  },
  detailInner: { padding: 12 },
  detailText: { fontSize: 12, color: '#D93025', lineHeight: 17 },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#0A84FF', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 28, marginTop: 22,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
