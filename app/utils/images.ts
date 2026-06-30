import { getApiBaseUrl } from './apiClient';

function safeDecode(input: string): string {
    try {
        return decodeURIComponent(input);
    } catch {
        return input;
    }
}

function normalizeIncomingPath(raw: string): string {
    const decoded = safeDecode(raw).trim();
    const noLeadingDot = decoded.replace(/^\.\//, '');
    const normalizedSlashes = noLeadingDot.replace(/\\/g, '/');
    return normalizedSlashes;
}

/**
 * Convertit un chemin de fichier relatif (stocké par Laravel) en URL API accessible.
 * 
 * Utilise la route /api/storage/{path} pour servir les fichiers via l'API Laravel,
 * ce qui évite les problèmes de configuration Nginx/Apache.
 * 
 * Exemples :
 * - "profiles/abc.jpg"      → "https://api.kekenon.com/api/storage/profiles/abc.jpg"
 * - "storage/profiles/abc.jpg" → "https://api.kekenon.com/api/storage/profiles/abc.jpg"
 * - "https://..."            → retourné tel quel
 * - "file://..."             → retourné tel quel (URI locale)
 * - null                     → null
 */
function storagePathFromUrlPathname(pathname: string): string | null {
    const p = pathname.split('?')[0]?.replace(/\/+$/, '') ?? '';
    let m = p.match(/\/api\/storage\/(.+)$/);
    if (m) return decodeURIComponent(m[1]);
    m = p.match(/\/storage\/(.+)$/);
    if (m) return decodeURIComponent(m[1]);
    return null;
}

export const getImageUrl = (path: string | null): string | null => {
    if (!path) return null;
    const normalizedPath = normalizeIncomingPath(path);

    if (normalizedPath.startsWith('file://')) {
        return normalizedPath;
    }

    if (normalizedPath.startsWith('http://') || normalizedPath.startsWith('https://')) {
        const base = getApiBaseUrl();
        if (base) {
            try {
                const u = new URL(normalizedPath);
                const rel = storagePathFromUrlPathname(u.pathname);
                if (rel) {
                    return `${base.replace(/\/$/, '')}/storage/${rel}`;
                }
            } catch {
                return null;
            }
        }
        return normalizedPath;
    }

    const cleanedPath = normalizedPath.replace(/^\/?(api\/)?(storage\/)?/, '');
    if (cleanedPath.includes('/assets/images') || cleanedPath.includes('assets/images/')) {
        return null;
    }
    const base = getApiBaseUrl();
    if (!base) return null;

    return `${base.replace(/\/$/, '')}/storage/${cleanedPath}`;
};

export const withImageVersion = (
    uri: string | null | undefined,
    seed?: string | number | null,
): string | null => {
    if (!uri) return null;
    const version = String(seed ?? Date.now());
    const separator = uri.includes('?') ? '&' : '?';
    return `${uri}${separator}v=${encodeURIComponent(version)}`;
};
