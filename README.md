# HeshBot

HeshBot is the chat assistant on [trevorheshka.com](https://trevorheshka.com). It replaces the old Typebot widget with a small, self-hosted bot:

- **Frontend:** `heshbot.js` + `heshbot.css`, vanilla JS/CSS with no dependencies. A tiny launcher bubble loads the widget only when someone clicks it. It works with the keyboard (Enter sends, Shift+Enter adds a new line, Esc closes), uses ARIA dialog/log roles, goes full-screen on phones, and uses the site's dark look. Bot replies go through a markdown-lite renderer that escapes everything first and then adds a short whitelist of tags. The conversation is kept in `sessionStorage`.
- **Backend:** `api/chat.php` (PHP 7.4+, curl) calls the Google Gemini API through REST (free-tier flash models, tried in order with fallback). It has file-based per-IP rate limiting, message and history caps, a same-origin check, JSON errors, and a friendly reply when the quota runs out. If no API key is set, it returns a mock reply.
- **Knowledge:** `api/system-prompt.md` plus `api/knowledge.md`, generated from the site's public pages by `tools/build_knowledge.py`.

## Layout
```
heshbot.js  heshbot.css  embed.html      widget + embed snippet
api/chat.php                             endpoint
api/system-prompt.md  api/knowledge.md   bot instructions + site knowledge
api/config.example.php                   config template (copy outside public_html)
api/.htaccess                            only chat.php is reachable
tools/build_knowledge.py                 regenerates api/knowledge.md
demo/index.html                          local demo page
```

## Setup
1. Get a Gemini API key from Google AI Studio.
2. Copy `api/config.example.php` to **`~/heshbot-config.php`** (your home directory, *outside* `public_html`) and set `gemini_key`. You can also set the env var `GEMINI_API_KEY`, which takes priority, or point `HESHBOT_CONFIG` at a config file. Never commit the real config.
3. Rate-limit data is written to `~/heshbot-data/` (change it with `data_dir`).
4. Regenerate the knowledge after site edits:
   `python3 tools/build_knowledge.py /path/to/site-root`

## Deploy (to `/heshbot/` on the server)
Upload `heshbot.js`, `heshbot.css` and the `api/` folder (`chat.php`, `.htaccess`, `system-prompt.md`, `knowledge.md`) to `public_html/heshbot/`. Do not upload `config.example.php`, `tools/` or `demo/`. Put `heshbot-config.php` in the account's home directory with `chmod 600`.

Check it with:
`curl -X POST -H 'Content-Type: application/json' -H 'Origin: https://trevorheshka.com' -d '{"messages":[{"role":"user","content":"hi"}]}' https://trevorheshka.com/heshbot/api/chat.php`

## Embed
Paste the contents of `embed.html` before `</body>`. Or, to load the widget right away:
```html
<script src="/heshbot/heshbot.js" defer></script>
```
CSP needs: `script-src 'self'` (plus `'unsafe-inline'` for the inline launcher), `style-src 'self'`, `connect-src 'self'`, `img-src data:`.

## Local test
```
php -S localhost:8000          # from a folder that contains heshbot/ ; open /heshbot/demo/
```
With no `GEMINI_API_KEY`, the endpoint returns a mock reply.

## License
MIT. See `LICENSE`.
