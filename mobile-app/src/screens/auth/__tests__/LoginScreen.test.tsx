import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}));

import LoginScreen from '../LoginScreen';
import { AuthContext } from '../../../context/AuthContext';

// Mock Navigation
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
  }),
}));

// Mock Ionicons
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

describe('LoginScreen Password Toggle', () => {
  const mockLogin = jest.fn();
  const defaultContext = {
    login: mockLogin,
    isLoading: false,
    isBootstrapping: false,
    error: null,
    user: null,
    token: null,
    register: jest.fn(),
    loginWithGoogle: jest.fn(),
    updateProfile: jest.fn(),
    logout: jest.fn(),
    checkAuthStatus: jest.fn(), clearError: jest.fn(),
  };

  it('toggles password visibility when eye icon is pressed', () => {
    const { getByPlaceholderText, getByLabelText } = render(
      <AuthContext.Provider value={defaultContext}>
        <LoginScreen />
      </AuthContext.Provider>
    );

    const passwordInput = getByPlaceholderText('Enter your password');
    
    // Initial state: secureTextEntry should be true (masked)
    // Note: react-test-renderer / testing-library might verify this via props
    expect(passwordInput.props.secureTextEntry).toBe(true);

    // Find the toggle button
    const toggleButton = getByLabelText('Show password');
    
    // Press it
    fireEvent.press(toggleButton);

    // State should change: secureTextEntry should be false (visible)
    expect(passwordInput.props.secureTextEntry).toBe(false);

    // Button label should change
    const hideButton = getByLabelText('Hide password');
    expect(hideButton).toBeTruthy();

    // Press again
    fireEvent.press(hideButton);

    // Should be hidden again
    expect(passwordInput.props.secureTextEntry).toBe(true);
  });
});
