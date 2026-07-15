// js/crypto.js
// Client-side zero-knowledge encryption module using the Web Crypto API.
// Provides secure PBKDF2 key derivation and AES-GCM encryption/decryption.

window.VaultCrypto = (function() {
    
    /**
     * Derives an AES-GCM CryptoKey from a master password and email (salt).
     * Uses PBKDF2 with 100,000 iterations.
     */
    async function deriveKey(password, email) {
        const encoder = new TextEncoder();
        const passwordBytes = encoder.encode(password);
        const saltBytes = encoder.encode(email.toLowerCase().trim());

        // Import the master password as raw key material for derivation
        const baseKey = await crypto.subtle.importKey(
            'raw',
            passwordBytes,
            'PBKDF2',
            false,
            ['deriveKey']
        );

        // Derive a 256-bit AES-GCM key
        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBytes,
                iterations: 1000000,
                hash: 'SHA-256'
            },
            baseKey,
            {
                name: 'AES-GCM',
                length: 256
            },
            true, // Exportable so we can save it in localStorage
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Exports a CryptoKey to a Base64 string for localStorage storage.
     */
    async function exportKeyToBase64(cryptoKey) {
        const rawKey = await crypto.subtle.exportKey('raw', cryptoKey);
        return btoa(String.fromCharCode(...new Uint8Array(rawKey)));
    }

    /**
     * Imports a CryptoKey from a Base64 string.
     */
    async function importKeyFromBase64(base64Key) {
        const rawKeyBytes = new Uint8Array(
            atob(base64Key).split('').map(char => char.charCodeAt(0))
        );
        return await crypto.subtle.importKey(
            'raw',
            rawKeyBytes,
            'AES-GCM',
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypts plain text using a CryptoKey.
     * Returns an object with base64 encoded ciphertext and initialization vector (iv).
     */
    async function encrypt(plaintext, cryptoKey) {
        const encoder = new TextEncoder();
        const plaintextBytes = encoder.encode(plaintext);
        
        // Generate a cryptographically secure random 12-byte IV for AES-GCM
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        const ciphertextBytes = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            cryptoKey,
            plaintextBytes
        );

        return {
            ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertextBytes))),
            iv: btoa(String.fromCharCode(...iv))
        };
    }

    /**
     * Decrypts a base64 ciphertext using a CryptoKey and a base64 initialization vector (iv).
     */
    async function decrypt(ciphertextBase64, ivBase64, cryptoKey) {
        try {
            const ciphertextBytes = new Uint8Array(
                atob(ciphertextBase64).split('').map(char => char.charCodeAt(0))
            );
            const ivBytes = new Uint8Array(
                atob(ivBase64).split('').map(char => char.charCodeAt(0))
            );

            const decryptedBytes = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: ivBytes
                },
                cryptoKey,
                ciphertextBytes
            );

            const decoder = new TextDecoder();
            return decoder.decode(decryptedBytes);
        } catch (error) {
            console.error("Decryption failed. Key or IV may be invalid.", error);
            return "[Decryption Error]";
        }
    }

    return {
        deriveKey,
        exportKeyToBase64,
        importKeyFromBase64,
        encrypt,
        decrypt
    };
})();
