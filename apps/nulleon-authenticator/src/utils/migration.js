export const V2_SCHEMA_VERSION = 2;

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
    if (items.some(item => !item || typeof item !== 'object' || Array.isArray(item) || (item.type && !['totp', 'note'].includes(item.type)))) throw new Error('Invalid vault item');

    const migratedItems = items.map(item => {
        const newItem = { ...item };

        // Ensure ID
        if (!newItem.id) newItem.id = window.crypto.randomUUID();

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
        }

        return newItem;
    });

    return {
        vaultVersion: V2_SCHEMA_VERSION,
        items: migratedItems
    };
}
