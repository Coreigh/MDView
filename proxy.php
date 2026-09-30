<?php
// SPDX-License-Identifier: MIT
//
// mdview/proxy.php - same-origin relay for drag-drop URLs.
//
// Without this proxy, the browser's cross-origin fetch gate (CORS) blocks
// every URL whose server does not send Access-Control-Allow-Origin headers
// (e.g. arbitrary personal servers, corporate wikis, most static hosts).
// With this proxy enabled in Settings, every dragged URL flows through this
// script on the same origin as mdview; CORS does not apply to same-origin
// fetches. The script then fetches the upstream URL as the server (no
// browser, no origin checks) and returns the body as text/plain.
//
// Defaults: 10-second timeout, follow up to 5 redirects, 5 MB response cap.
// Errors are returned as HTTP status codes with a short reason in the body.
header('Access-Control-Allow-Origin: *');
header('Content-Type: text/plain; charset=utf-8');

$url = $_GET['url'] ?? '';
if (!$url) {
  http_response_code(400);
  echo 'missing url parameter';
  exit;
}

$parts = parse_url($url);
if (!$parts || !in_array($parts['scheme'] ?? '', ['http', 'https'])) {
  http_response_code(400);
  echo 'only http and https URLs are accepted';
  exit;
}

$ctx = stream_context_create([
  'http' => [
    'timeout' => 10,
    'follow_location' => 1,
    'max_redirects' => 5,
    'header' => "User-Agent: mdview-proxy\r\n"
  ]
]);
$body = @file_get_contents($url, false, $ctx);
if ($body === false) {
  http_response_code(502);
  echo 'upstream fetch failed';
  exit;
}
if (strlen($body) > 5 * 1024 * 1024) {
  http_response_code(413);
  echo 'upstream response exceeds 5 MB cap';
  exit;
}
echo $body;
