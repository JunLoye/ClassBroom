const SettingsLock = (() => {
    const ITERATIONS = 210000;
    const MIN_PIN_LENGTH = 6;
    const MAX_PIN_LENGTH = 64;

    function getCrypto() {
        if (globalThis.crypto?.subtle) return globalThis.crypto;
        if (typeof require === 'function') return require('node:crypto').webcrypto;
        throw new Error('Web Crypto is unavailable');
    }

    function encodeBase64(bytes) {
        if (typeof btoa === 'function') return btoa(String.fromCharCode(...bytes));
        return Buffer.from(bytes).toString('base64');
    }

    function decodeBase64(value) {
        if (typeof atob === 'function') return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
        return new Uint8Array(Buffer.from(value, 'base64'));
    }

    async function derive(pin, salt, iterations) {
        const cryptoApi = getCrypto();
        const key = await cryptoApi.subtle.importKey(
            'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']
        );
        return new Uint8Array(await cryptoApi.subtle.deriveBits({
            name: 'PBKDF2', salt, iterations, hash: 'SHA-256'
        }, key, 256));
    }

    function isValidPin(pin) {
        return typeof pin === 'string' && pin.trim().length >= MIN_PIN_LENGTH && pin.length <= MAX_PIN_LENGTH;
    }

    async function createVerifier(pin) {
        if (!isValidPin(pin)) throw new Error('PIN must be 6 to 64 characters');
        const cryptoApi = getCrypto();
        const salt = cryptoApi.getRandomValues(new Uint8Array(16));
        const hash = await derive(pin, salt, ITERATIONS);
        return {
            algorithm: 'PBKDF2-SHA-256',
            iterations: ITERATIONS,
            salt: encodeBase64(salt),
            hash: encodeBase64(hash)
        };
    }

    async function verifyPin(pin, verifier) {
        if (!isValidPin(pin) || verifier?.algorithm !== 'PBKDF2-SHA-256' ||
            !Number.isInteger(verifier.iterations) || verifier.iterations < 100000 || verifier.iterations > 500000 ||
            typeof verifier.salt !== 'string' || typeof verifier.hash !== 'string') return false;
        try {
            const actual = await derive(pin, decodeBase64(verifier.salt), verifier.iterations);
            const expected = decodeBase64(verifier.hash);
            if (actual.length !== expected.length) return false;
            let difference = 0;
            for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
            return difference === 0;
        } catch (error) {
            return false;
        }
    }

    return { createVerifier, verifyPin };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SettingsLock;
if (typeof globalThis !== 'undefined') globalThis.SettingsLock = SettingsLock;