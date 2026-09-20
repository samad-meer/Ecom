import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}));

import RegisterScreen from '../RegisterScreen';
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

describe('RegisterScreen Password Toggle', () => {
  const mockRegister = jest.fn();
  const defaultContext = {
    register: mockRegister,
    isLoading: false,
    isBootstrapping: false,
    error: null,
    user: null,
    token: null,
    login: jest.fn(),
    loginWithGoogle: jest.fn(),
    updateProfile: jest.fn(),
    logout: jest.fn(),
    checkAuthStatus: jest.fn(), clearError: jest.fn(),
  };

  it('toggles password visibility when eye icon is pressed', () => {
    const { getByPlaceholderText, getByLabelText } = render(
      <AuthContext.Provider value={defaultContext}>
        <RegisterScreen />
      </AuthContext.Provider>
    );

    const passwordInput = getByPlaceholderText('Enter your password');
    
    // Initial state: masked
    expect(passwordInput.props.secureTextEntry).toBe(true);

    // Toggle
    const toggleButton = getByLabelText('Show password');
    fireEvent.press(toggleButton);

    // State: visible
    expect(passwordInput.props.secureTextEntry).toBe(false);

    // Toggle back
    const hideButton = getByLabelText('Hide password');
    fireEvent.press(hideButton);

    // State: masked
    expect(passwordInput.props.secureTextEntry).toBe(true);
  });

  it('toggles confirm password visibility when eye icon is pressed', () => {
    const { getByPlaceholderText, getByLabelText } = render(
      <AuthContext.Provider value={defaultContext}>
        <RegisterScreen />
      </AuthContext.Provider>
    );

    const confirmPasswordInput = getByPlaceholderText('Confirm your password');
    
    // Initial state: masked
    expect(confirmPasswordInput.props.secureTextEntry).toBe(true);

    // Toggle
    const toggleButton = getByLabelText('Show confirm password');
    fireEvent.press(toggleButton);

    // State: visible
    expect(confirmPasswordInput.props.secureTextEntry).toBe(false);

    // Toggle back
    const hideButton = getByLabelText('Hide confirm password');
    fireEvent.press(hideButton);

    // State: masked
    expect(confirmPasswordInput.props.secureTextEntry).toBe(true);
  });
});
