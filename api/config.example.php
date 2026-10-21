<?php
// Copy to ~/heshbot-config.php (OUTSIDE public_html) and fill in your key.
// Never commit the real file. Env var GEMINI_API_KEY also works and wins if set.
return [
    'gemini_key'      => 'PASTE-YOUR-GEMINI-API-KEY',
    // Tried in order; next one is used on 404 / 429 / 5xx.
    'models'          => ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'],
    'allowed_origins' => ['https://trevorheshka.com'],
    'rate_per_minute' => 6,
    'rate_per_day'    => 60,
];
