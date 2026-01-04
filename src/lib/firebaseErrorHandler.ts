// Firebase Error Handler - Centralized error handling for Firebase operations
import { FirebaseError } from 'firebase/app';

/**
 * User-friendly error messages for common Firebase errors
 */
const ERROR_MESSAGES: Record<string, string> = {
    // Authentication Errors
    'auth/invalid-credential': 'Invalid email or password. Please check your credentials and try again.',
    'auth/user-not-found': 'No account found with this email address.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/email-already-in-use': 'This email is already registered. Please use a different email or try logging in.',
    'auth/weak-password': 'Password is too weak. Please use at least 6 characters.',
    'auth/invalid-email': 'Invalid email address format.',
    'auth/user-disabled': 'This account has been disabled. Please contact support.',
    'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Please check your internet connection.',
    'auth/requires-recent-login': 'This operation requires recent authentication. Please log out and log in again.',

    // Firestore Errors
    'permission-denied': 'You do not have permission to perform this action.',
    'not-found': 'The requested data was not found.',
    'already-exists': 'This record already exists.',
    'failed-precondition': 'Operation failed due to invalid state. Please refresh and try again.',
    'aborted': 'Operation was aborted. Please try again.',
    'out-of-range': 'Invalid data range provided.',
    'unavailable': 'Service is temporarily unavailable. Please try again in a moment.',
    'data-loss': 'Data loss detected. Please contact support.',
    'unauthenticated': 'You must be logged in to perform this action.',
    'resource-exhausted': 'Too many requests. Please wait a moment and try again.',
    'cancelled': 'Operation was cancelled.',
    'invalid-argument': 'Invalid data provided. Please check your input.',
    'deadline-exceeded': 'Operation took too long. Please try again.',
    'unknown': 'An unexpected error occurred. Please try again.',

    // Network Errors
    'network-error': 'Network connection failed. Please check your internet connection.',
    'timeout': 'Request timed out. Please check your connection and try again.',
};

/**
 * Error recovery suggestions based on error type
 */
const RECOVERY_SUGGESTIONS: Record<string, string[]> = {
    'auth/network-request-failed': [
        'Check your internet connection',
        'Try again in a few moments',
        'If the problem persists, contact support'
    ],
    'permission-denied': [
        'Make sure you are logged in',
        'Verify you have the necessary permissions',
        'Contact an administrator if you believe this is an error'
    ],
    'unavailable': [
        'Wait a few moments and try again',
        'Check your internet connection',
        'The service may be temporarily down'
    ],
    'auth/too-many-requests': [
        'Wait a few minutes before trying again',
        'Clear your browser cache',
        'Try using the "Forgot Password" feature if you\'re having trouble logging in'
    ]
};

/**
 * Translates Firebase error codes to user-friendly messages
 */
export const getErrorMessage = (error: any): string => {
    if (!error) return 'An unknown error occurred';

    // Handle Firebase errors
    if (error.code) {
        return ERROR_MESSAGES[error.code] || error.message || 'An unexpected error occurred';
    }

    // Handle regular errors
    if (error.message) {
        return error.message;
    }

    // Fallback
    return 'An unexpected error occurred. Please try again.';
};

/**
 * Gets recovery suggestions for an error
 */
export const getRecoverySuggestions = (error: any): string[] => {
    if (!error || !error.code) return [];

    return RECOVERY_SUGGESTIONS[error.code] || [];
};

/**
 * Logs error for debugging (in development) or error tracking (in production)
 */
export const logError = (context: string, error: any, additionalInfo?: any): void => {
    const errorInfo = {
        context,
        timestamp: new Date().toISOString(),
        error: {
            code: error?.code,
            message: error?.message,
            stack: error?.stack
        },
        additionalInfo
    };

    // In development, log to console
    if (import.meta.env.DEV) {
        console.error(`[${context}]`, errorInfo);
    }

    // In production, you would send this to an error tracking service
    // Example: Sentry, LogRocket, etc.
    // if (import.meta.env.PROD) {
    //     sendToErrorTracking(errorInfo);
    // }
};

/**
 * Determines if an error is a network-related error
 */
export const isNetworkError = (error: any): boolean => {
    if (!error) return false;

    const networkErrorCodes = [
        'auth/network-request-failed',
        'unavailable',
        'network-error',
        'timeout'
    ];

    return networkErrorCodes.includes(error.code) ||
        error.message?.toLowerCase().includes('network') ||
        error.message?.toLowerCase().includes('connection');
};

/**
 * Determines if an error is recoverable (user can retry)
 */
export const isRecoverableError = (error: any): boolean => {
    if (!error) return false;

    const recoverableErrorCodes = [
        'auth/network-request-failed',
        'unavailable',
        'aborted',
        'cancelled',
        'deadline-exceeded',
        'resource-exhausted'
    ];

    return recoverableErrorCodes.includes(error.code);
};

/**
 * Comprehensive error handler that returns formatted error information
 */
export const handleFirebaseError = (error: any, context: string = 'Operation') => {
    logError(context, error);

    return {
        message: getErrorMessage(error),
        suggestions: getRecoverySuggestions(error),
        isNetworkError: isNetworkError(error),
        isRecoverable: isRecoverableError(error),
        originalError: error
    };
};

/**
 * Helper to create user-facing error messages with context
 */
export const createErrorMessage = (operation: string, error: any): string => {
    const baseMessage = getErrorMessage(error);
    return `${operation} failed: ${baseMessage}`;
};
