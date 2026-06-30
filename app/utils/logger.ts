import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getAuthToken, removeAuthToken } from './authTokenStorage';

const LOG_STORAGE_KEY = '@app_debug_logs_driver';
const MAX_LOCAL_LOGS = 100;

export type LogLevel = 'info' | 'warning' | 'error' | 'debug';

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: any;
}

class Logger {
    private app: 'passenger' | 'driver';
    private apiUrl: string | undefined;

    constructor(app: 'passenger' | 'driver') {
        this.app = app;
        this.apiUrl = process.env.EXPO_PUBLIC_API_URL;
    }

    private async getDeviceInfo() {
        return {
            platform: Platform.OS,
            version: Platform.Version,
            isEmulator: __DEV__,
        };
    }

    private async saveLocalLog(entry: LogEntry) {
        try {
            const existingLogsJson = await AsyncStorage.getItem(LOG_STORAGE_KEY);
            const existingLogs: LogEntry[] = existingLogsJson ? JSON.parse(existingLogsJson) : [];

            const updatedLogs = [entry, ...existingLogs].slice(0, MAX_LOCAL_LOGS);
            await AsyncStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(updatedLogs));
        } catch (e) {
            console.error('Failed to save local log', e);
        }
    }

    async getLocalLogs(): Promise<LogEntry[]> {
        try {
            const logsJson = await AsyncStorage.getItem(LOG_STORAGE_KEY);
            return logsJson ? JSON.parse(logsJson) : [];
        } catch (e) {
            return [];
        }
    }

    async clearLocalLogs() {
        await AsyncStorage.removeItem(LOG_STORAGE_KEY);
    }

    private async reportRemote(level: LogLevel, message: string, context?: any) {
        if (!this.apiUrl) return;

        try {
            const token = await getAuthToken();
            const deviceInfo = await this.getDeviceInfo();

            // We use standard fetch here to avoid circular dependency with networkHandler
            fetch(`${this.apiUrl}/analytics/log`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    app: this.app,
                    level,
                    message,
                    context,
                    device_info: deviceInfo,
                }),
            }).catch(e => {
                // Silently fail remote logging
            });
        } catch (e) {
            // Silently fail
        }
    }

    info(message: string, context?: any) {
        const entry: LogEntry = { timestamp: new Date().toISOString(), level: 'info', message, context };
        this.saveLocalLog(entry);
        console.log(`[${this.app.toUpperCase()}] INFO: ${message}`, context || '');
    }

    warn(message: string, context?: any) {
        const entry: LogEntry = { timestamp: new Date().toISOString(), level: 'warning', message, context };
        this.saveLocalLog(entry);
        console.warn(`[${this.app.toUpperCase()}] WARN: ${message}`, context || '');
        this.reportRemote('warning', message, context);
    }

    error(message: string, context?: any) {
        const entry: LogEntry = { timestamp: new Date().toISOString(), level: 'error', message, context };
        this.saveLocalLog(entry);
        console.error(`[${this.app.toUpperCase()}] ERROR: ${message}`, context || '');
        this.reportRemote('error', message, context);
    }

    debug(message: string, context?: any) {
        if (!__DEV__) return;
        const entry: LogEntry = { timestamp: new Date().toISOString(), level: 'debug', message, context };
        this.saveLocalLog(entry);
        console.log(`[${this.app.toUpperCase()}] DEBUG: ${message}`, context || '');
    }
}

export const logger = new Logger('driver');
