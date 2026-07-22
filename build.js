// build.js
// Build script to generate js/config.js from environment variables during deployment (e.g. Cloudflare Pages)

const fs = require('fs');
const path = require('path');

// Helper to load .env or .dev.vars files if they exist locally
const loadEnvFile = (filename) => {
    try {
        const filePath = path.join(__dirname, filename);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            content.split(/\r?\n/).forEach(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return;
                const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)$/);
                if (match) {
                    const key = match[1];
                    let val = match[2] || '';
                    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                        val = val.slice(1, -1);
                    }
                    if (!process.env[key]) process.env[key] = val.trim();
                }
            });
        }
    } catch (e) {
        // Ignore read errors
    }
};

loadEnvFile('.env');
loadEnvFile('.dev.vars');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';

const configContent = `// js/config.js
// Auto-generated during build from environment variables
window.SUPABASE_URL = "${supabaseUrl}";
window.SUPABASE_PUBLISHABLE_KEY = "${supabasePublishableKey}";
window.SUPABASE_ANON_KEY = "${supabasePublishableKey}";
`;

fs.writeFileSync(path.join(__dirname, 'js', 'config.js'), configContent);
console.log('✅ Successfully generated js/config.js from environment variables.');
