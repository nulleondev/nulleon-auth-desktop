export function normalizeSecret(secret) {
    if (!secret) return '';
    return secret.replace(/\s/g, '').replace(/-/g, '').replace(/=+$/, '').toUpperCase();
}

export function validateSecret(secret) {
    if (!secret) return { valid: false, error: 'Secret é obrigatória' };

    const clean = normalizeSecret(secret);

    // Base32 Regex: A-Z, 2-7
    const base32Regex = /^[A-Z2-7]+$/;
    if (!base32Regex.test(clean)) {
        return { valid: false, error: 'Secret inválida (apenas A-Z e 2-7)' };
    }

    if (clean.length < 16) {
        return { valid: false, error: 'Secret muito curta' };
    }

    return { valid: true };
}
