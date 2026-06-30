const apiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!apiUrl) {
    console.error('EXPO_PUBLIC_API_URL is not configured. Please set it in your environment.');
}

export const API_URL = apiUrl ?? '';
