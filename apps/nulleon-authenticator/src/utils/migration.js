export const V2_SCHEMA_VERSION = 2;

function createItemId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (globalThis.crypto?.getRandomValues) {
        const bytes = new Uint8Array(16);
        globalThis.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    throw new Error('Secure random generator unavailable');
}

export function migrateVaultIfNeeded(rawData) {
    let items = [];

    if (Array.isArray(rawData)) {
        items = rawData;
    } else if (rawData && Array.isArray(rawData.items)) {
        items = rawData.items;
    } else {
        throw new Error('Invalid vault container');
    }
    if (items.length > 10000 || (rawData?.vaultVersion !== undefined && rawData.vaultVersion !== 2)) throw new Error('Unsupported vault schema');
    if (items.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error('Invalid vault item');

    const migratedItems = items.map(item => {
        const newItem = { ...item };

        // Ensure ID
        if (!newItem.id) newItem.id = createItemId();

        // Normalize TOTP secret (key -> secret, token -> secret, otpauth -> secret, code -> secret)
        const secretKeys = ['secret', 'key', 'token', 'otpauth', 'code', 'apikey', 'api_key'];
        for (const k of secretKeys) {
            if (newItem[k]) {
                const val = String(newItem[k]).trim();
                if (val.length > 4) {
                    if (!newItem.secret || newItem.secret === val) {
                        newItem.secret = val;
                        break;
                    }
                }
            }
        }

        // Normalize Note content (note -> content, notes -> content, text -> content, desc -> content, etc)
        const contentKeys = ['content', 'note', 'notes', 'text', 'desc', 'body', 'data', 'message', 'value'];
        for (const k of contentKeys) {
            if (newItem[k]) {
                const val = String(newItem[k]).trim();
                if (val && (!newItem.content || newItem.content === val)) {
                    newItem.content = val;
                    break;
                }
            }
        }

        // Infer type if missing
        if (!newItem.type) {
            if (newItem.secret || newItem.key || newItem.token || newItem.otpauth || newItem.code) {
                newItem.type = 'totp';
            } else {
                newItem.type = 'note';
            }
        } else if (!['totp', 'note'].includes(newItem.type)) {
            // Preserve legacy labels while presenting the item through the current UI.
            newItem.legacyType = newItem.type;
            newItem.type = newItem.secret ? 'totp' : 'note';
        }

        return newItem;
    });

    return {
        vaultVersion: V2_SCHEMA_VERSION,
        items: migratedItems
    };
}
