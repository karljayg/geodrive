<?php
// Keeps the parts of Overture's places file that players have asked for, so the game doesn't depend on that file staying where it is
// and each area is only ever fetched once. It serves one file from one address, never a URL it's given. The copies sit outside the
// deployed folder, which each deploy mirrors, in a folder scripts/deploy.sh closes to the web.
const CACHE_DIR = __DIR__ . '/../geodrive-cache';
const BASE = 'https://overturemaps-extras-us-west-2.s3.amazonaws.com';
const MAX_PART = 12000000;       // bytes in one request; a tile of Manhattan is a few MB
const MAX_TOTAL = 3000000000;    // bytes kept in all; past this it still answers, and keeps nothing more
const LIST_LIFE = 86400;         // s before asking again what the newest release is
const MOST_A_MINUTE = 240;       // requests to Overture, as anyone can ask this

function refuse($status, $why) {
  http_response_code($status);
  header('Content-Type: text/plain');
  echo $why;
  exit;
}

function answer($body, $type, $life) {
  header("Content-Type: $type");
  header("Cache-Control: public, max-age=$life");
  echo $body;
  exit;
}

// False once too many requests have gone out in this minute.
function allowed() {
  $file = CACHE_DIR . '/.minute';
  $now = (int) (time() / 60);
  $handle = @fopen($file, 'c+');
  if (!$handle) return false;
  flock($handle, LOCK_EX);
  [$minute, $count] = array_pad(explode(' ', (string) fread($handle, 40)), 2, 0);
  $count = (int) $minute === $now ? (int) $count + 1 : 1;
  rewind($handle);
  ftruncate($handle, 0);
  fwrite($handle, "$now $count");
  fclose($handle);
  return $count <= MOST_A_MINUTE;
}

function fetchFrom($url, $headers = []) {
  $context = stream_context_create(['http' => ['timeout' => 25, 'ignore_errors' => true, 'header' => $headers], 'ssl' => ['verify_peer' => true]]);
  $body = @file_get_contents($url, false, $context);
  $status = isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m) ? (int) $m[1] : 0;
  return $body !== false && ($status === 200 || $status === 206) ? $body : null;
}

function keep($file, $body) {
  $held = 0;
  foreach (glob(CACHE_DIR . '/*.bin') ?: [] as $one) $held += filesize($one);
  if ($held + strlen($body) <= MAX_TOTAL) @file_put_contents($file, $body, LOCK_EX);
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== $_SERVER['HTTP_HOST']) refuse(403, 'wrong origin');

if (isset($_GET['list'])) {
  $file = CACHE_DIR . '/releases.xml';
  if (is_file($file) && time() - filemtime($file) < LIST_LIFE) answer(file_get_contents($file), 'application/xml', 3600);
  $body = allowed() ? fetchFrom(BASE . '/?list-type=2&prefix=tiles/&delimiter=/') : null;
  if ($body !== null) {
    @file_put_contents($file, $body, LOCK_EX);
    answer($body, 'application/xml', 3600);
  }
  if (is_file($file)) answer(file_get_contents($file), 'application/xml', 60); // old is better than nothing
  refuse(502, 'no list');
}

$release = $_GET['release'] ?? '';
$start = filter_var($_GET['start'] ?? '', FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
$length = filter_var($_GET['length'] ?? '', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => MAX_PART]]);
if (!preg_match('/^\d{4}-\d{2}-\d{2}\.\d+$/', $release) || $start === false || $length === false) refuse(400, 'bad request');

$file = CACHE_DIR . '/' . sha1("$release/$start/$length") . '.bin';
if (is_file($file)) answer(file_get_contents($file), 'application/octet-stream', 2592000);
if (!allowed()) refuse(429, 'busy');
$body = fetchFrom(BASE . "/tiles/$release/places.pmtiles", ['Range: bytes=' . $start . '-' . ($start + $length - 1)]);
if ($body === null) refuse(502, 'no answer');
keep($file, $body);
answer($body, 'application/octet-stream', 2592000);
