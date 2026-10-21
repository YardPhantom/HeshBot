<?php
/**
 * HeshBot chat endpoint. PHP 7.4+ (no newer syntax). POST JSON {messages:[{role,content}]}
 * Returns JSON {reply:"..."} or {error:"...", reply:"friendly text"}.
 */
declare(strict_types=1);

const HB_MAX_MSG_CHARS  = 1000;   // per user message
const HB_MAX_HISTORY    = 12;     // messages kept (user+model)
const HB_MAX_TOTAL      = 8000;   // chars across history
const HB_CONTACT        = 'trevor@trevorheshka.com';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function hb_out(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
function hb_fail(int $code, string $err, string $reply = ''): void {
    if ($reply === '') {
        $reply = "Sorry, I can't answer right now. Please email " . HB_CONTACT . ' and Trevor will get back to you.';
    }
    hb_out($code, ['error' => $err, 'reply' => $reply]);
}

/* ---------- config ---------- */
function hb_config(): array {
    $cfg = [];
    $home = getenv('HOME') ?: (function_exists('posix_getpwuid') ? (posix_getpwuid(posix_geteuid())['dir'] ?? '') : '');
    $paths = array_filter([
        getenv('HESHBOT_CONFIG') ?: '',
        $home ? $home . '/heshbot-config.php' : '',
        dirname(__DIR__, 3) . '/heshbot-config.php', // ~/public_html/heshbot/api -> ~/
    ]);
    foreach ($paths as $p) {
        if (is_file($p) && is_readable($p)) { $c = include $p; if (is_array($c)) { $cfg = $c; break; } }
    }
    $env = getenv('GEMINI_API_KEY');
    if ($env) { $cfg['gemini_key'] = $env; }
    $cfg += [
        'gemini_key' => '',
        'models' => ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'],
        'allowed_origins' => ['https://trevorheshka.com'],
        'rate_per_minute' => 6,
        'rate_per_day' => 60,
        'data_dir' => $home ? $home . '/heshbot-data' : __DIR__ . '/data',
    ];
    return $cfg;
}
$cfg = hb_config();

/* ---------- method + same-origin ---------- */
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    hb_fail(405, 'method_not_allowed');
}
$host = strtolower($_SERVER['HTTP_HOST'] ?? '');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$referer = $_SERVER['HTTP_REFERER'] ?? '';
$src = $origin !== '' ? $origin : $referer;
$srcHost = strtolower((string)parse_url($src, PHP_URL_HOST));
$srcPort = parse_url($src, PHP_URL_PORT);
if ($srcPort) { $srcHost .= ':' . $srcPort; }
$okOrigin = $srcHost !== '' && $srcHost === $host;
foreach ((array)$cfg['allowed_origins'] as $o) {
    if ($origin !== '' && rtrim($o, '/') === rtrim($origin, '/')) { $okOrigin = true; }
}
if (!$okOrigin) { hb_fail(403, 'forbidden_origin'); }
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') === false) {
    hb_fail(415, 'json_required');
}

/* ---------- rate limit (file-based, per IP) ---------- */
function hb_rate_ok(array $cfg): bool {
    $dir = $cfg['data_dir'];
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) { return true; } // fail open if storage missing
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0';
    $file = $dir . '/rl_' . hash('sha256', $ip . '|heshbot') . '.json';
    $fh = @fopen($file, 'c+');
    if (!$fh) { return true; }
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $d = json_decode($raw ?: '[]', true);
    $now = time();
    $day = gmdate('Ymd');
    $min = array_values(array_filter((array)($d['m'] ?? []), function ($t) use ($now) { return $t > $now - 60; }));
    $dc = (($d['day'] ?? '') === $day) ? (int)($d['dc'] ?? 0) : 0;
    $ok = count($min) < (int)$cfg['rate_per_minute'] && $dc < (int)$cfg['rate_per_day'];
    if ($ok) { $min[] = $now; $dc++; }
    ftruncate($fh, 0); rewind($fh);
    fwrite($fh, json_encode(['m' => $min, 'day' => $day, 'dc' => $dc]));
    flock($fh, LOCK_UN); fclose($fh);
    if (mt_rand(1, 50) === 1) { // occasional cleanup of stale files
        foreach ((array)glob($dir . '/rl_*.json') as $f) { if (@filemtime($f) < $now - 172800) { @unlink($f); } }
    }
    return $ok;
}
if (!hb_rate_ok($cfg)) {
    hb_fail(429, 'rate_limited', "You're sending messages quickly. Please wait a minute, or email " . HB_CONTACT . '.');
}

/* ---------- input ---------- */
$raw = file_get_contents('php://input', false, null, 0, 64000);
$in = json_decode((string)$raw, true);
if (!is_array($in) || !isset($in['messages']) || !is_array($in['messages'])) { hb_fail(400, 'bad_request'); }
$msgs = array_slice($in['messages'], -HB_MAX_HISTORY);
$tail = end($msgs);
$tailText = (is_array($tail) && is_string($tail['content'] ?? null)) ? trim($tail['content']) : '';
if ((function_exists('mb_strlen') ? mb_strlen($tailText) : strlen($tailText)) > HB_MAX_MSG_CHARS) {
    hb_fail(413, 'message_too_long', 'That message is a bit long. Please keep it under ' . HB_MAX_MSG_CHARS . ' characters.');
}
$contents = [];
$total = 0;
foreach (array_reverse($msgs) as $m) {
    if (!is_array($m)) { continue; }
    $role = (($m['role'] ?? '') === 'user') ? 'user' : 'model';
    $text = trim(is_string($m['content'] ?? null) ? $m['content'] : '');
    if ($text === '') { continue; }
    if (function_exists('mb_substr')) { $text = mb_substr($text, 0, HB_MAX_MSG_CHARS * ($role === 'user' ? 1 : 2)); }
    else { $text = substr($text, 0, HB_MAX_MSG_CHARS * ($role === 'user' ? 1 : 2)); }
    $total += strlen($text);
    if ($total > HB_MAX_TOTAL) { break; }
    array_unshift($contents, ['role' => $role, 'parts' => [['text' => $text]]]);
}
while ($contents && $contents[0]['role'] !== 'user') { array_shift($contents); }
if (!$contents || end($contents)['role'] !== 'user') { hb_fail(400, 'no_user_message'); }

/* ---------- prompt ---------- */
$system = (string)@file_get_contents(__DIR__ . '/system-prompt.md')
    . "\n\n=== KNOWLEDGE (public content of trevorheshka.com) ===\n"
    . (string)@file_get_contents(__DIR__ . '/knowledge.md');

/* ---------- mock when no key ---------- */
if ($cfg['gemini_key'] === '') {
    $reply = 'Trevor Heshka is a **full-stack developer** in Nanaimo, BC. He builds web portals, data apps and AI assistants, '
        . "including custom LLM models.\n\n- [Projects](https://trevorheshka.com/projects/)\n- [AI apps](https://trevorheshka.com/ai/)\n\n"
        . 'For anything else, email ' . HB_CONTACT . '. *(demo reply: no API key configured)*';
    hb_out(200, ['reply' => $reply, 'mock' => true]);
}

/* ---------- Gemini ---------- */
function hb_gemini(string $model, string $key, array $payload): array {
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'x-goog-api-key: ' . $key],
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 40,
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$code, is_string($body) ? json_decode($body, true) : null];
}
$payload = [
    'systemInstruction' => ['parts' => [['text' => $system]]],
    'contents' => $contents,
    'generationConfig' => ['temperature' => 0.3, 'maxOutputTokens' => 1024],
    'safetySettings' => [
        ['category' => 'HARM_CATEGORY_HARASSMENT', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
        ['category' => 'HARM_CATEGORY_HATE_SPEECH', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
    ],
];
$quota = false;
foreach ((array)$cfg['models'] as $model) {
    list($code, $res) = hb_gemini((string)$model, (string)$cfg['gemini_key'], $payload);
    if ($code === 200 && is_array($res)) {
        $text = '';
        foreach ((array)($res['candidates'][0]['content']['parts'] ?? []) as $p) {
            if (isset($p['text']) && empty($p['thought'])) { $text .= $p['text']; }
        }
        $text = trim($text);
        if ($text === '') { $text = "I'm not sure about that. Please email " . HB_CONTACT . '.'; }
        $text = preg_replace('/instagram[-_ ]?auto[-_ ]?darkroom/i', 'that', $text);
        hb_out(200, ['reply' => $text]);
    }
    if ($code === 429) { $quota = true; }
    if (!in_array($code, [0, 404, 429, 500, 502, 503, 504], true)) { break; } // 400/403: don't retry
}
if ($quota) {
    hb_fail(503, 'quota', "HeshBot has hit today's free usage limit. Please email " . HB_CONTACT . " and Trevor will reply personally, or try again tomorrow.");
}
hb_fail(502, 'upstream_error');
