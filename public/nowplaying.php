<?php
// What a radio station says is playing. Song titles travel inside the audio stream, where a browser can't read them
// for most stations, so this opens the stream, reads as far as the first title and hangs up. It takes a station's
// id rather than a URL, so it can't be pointed at anything but a stream the Radio Browser directory lists.
const CACHE_DIR = '/geodrive-nowplaying';  // under the system's temp folder
const TITLE_FOR = 15;                      // seconds an answer is shared, however many players ask
const URL_FOR = 86400;                     // seconds a station's address is remembered
const MAX_READS = 60;                      // streams opened a minute in all, as anyone can call this and the server is shared
const MAX_BYTES = 80000;                   // of a stream read before giving up on finding a title
const MAX_METAINT = 65536;                 // bytes of audio between titles that a real stream could use
const MAX_HOPS = 3;                        // redirects followed
const DIRECTORY = ['de1.api.radio-browser.info', 'de2.api.radio-browser.info', 'fi1.api.radio-browser.info'];

function answer($status, $body, $cacheFor = 0) {
  http_response_code($status);
  header('Content-Type: application/json');
  header($cacheFor ? "Cache-Control: max-age=$cacheFor" : 'Cache-Control: no-store');
  echo json_encode($body, JSON_INVALID_UTF8_SUBSTITUTE);
  exit;
}

// Only a public address, so a directory entry can't reach anything inside the server's own network.
function publicAddress($host) {
  $ip = gethostbyname($host);
  return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) ?: null;
}

function stationUrl($id) {
  foreach (DIRECTORY as $host) {
    $curl = curl_init("https://$host/json/stations/byuuid/$id");
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 3, CURLOPT_USERAGENT => 'GeoDrive/1.0']);
    $stations = json_decode((string) curl_exec($curl), true);
    if (is_array($stations) && curl_getinfo($curl, CURLINFO_RESPONSE_CODE) === 200) {
      $station = $stations[0] ?? [];
      return ($station['url_resolved'] ?? '') ?: ($station['url'] ?? '');
    }
  }
  return '';
}

// Opens the stream and walks its metadata blocks until one holds something. Null if it doesn't carry any.
function readMetadata($url) {
  for ($hop = 0; $hop <= MAX_HOPS; $hop++) {
    $parts = parse_url($url);
    if (($parts['scheme'] ?? '') !== 'https' || empty($parts['host'])) return null;
    $ip = publicAddress($parts['host']);
    if (!$ip) return null;
    $port = $parts['port'] ?? 443;
    $metaint = 0; $location = ''; $buffer = ''; $at = 0; $found = null;
    $curl = curl_init($url);
    curl_setopt_array($curl, [
      CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
      CURLOPT_RESOLVE => ["{$parts['host']}:$port:$ip"], // the address that was checked, not a second lookup's answer
      CURLOPT_HTTPHEADER => ['Icy-MetaData: 1'],
      CURLOPT_USERAGENT => 'GeoDrive/1.0',
      CURLOPT_CONNECTTIMEOUT => 3,
      CURLOPT_TIMEOUT => 6,
      CURLOPT_HEADERFUNCTION => function ($c, $line) use (&$metaint, &$location) {
        if (preg_match('/^icy-metaint:\s*(\d+)/i', $line, $m)) $metaint = (int) $m[1];
        if (preg_match('/^location:\s*(\S+)/i', $line, $m)) $location = $m[1];
        return strlen($line);
      },
      CURLOPT_WRITEFUNCTION => function ($c, $data) use (&$metaint, &$buffer, &$at, &$found) {
        if ($metaint < 1 || $metaint > MAX_METAINT) return -1;
        $buffer .= $data;
        while (strlen($buffer) > $at + $metaint) {
          $length = ord($buffer[$at + $metaint]) * 16;
          if (strlen($buffer) < $at + $metaint + 1 + $length) break;
          if ($length) {
            $found = rtrim(substr($buffer, $at + $metaint + 1, $length), "\0");
            return -1;
          }
          $at += $metaint + 1;
        }
        return strlen($buffer) > MAX_BYTES ? -1 : strlen($data);
      },
    ]);
    curl_exec($curl);
    if ($location === '' || $metaint) return $metaint ? ['supported' => true, 'metadata' => $found] : null;
    $url = $location;
  }
  return null;
}

// Counts streams opened this minute. False once there have been too many.
function mayRead() {
  $file = fopen(sys_get_temp_dir() . CACHE_DIR . '/reads', 'c+');
  if (!$file || !flock($file, LOCK_EX)) return false;
  [$minute, $count] = array_map('intval', explode(' ', stream_get_contents($file) . ' 0 0'));
  if ($minute !== (int) (time() / 60)) { $minute = (int) (time() / 60); $count = 0; }
  $allowed = $count < MAX_READS;
  if ($allowed) {
    ftruncate($file, 0);
    rewind($file);
    fwrite($file, $minute . ' ' . ($count + 1));
  }
  fclose($file);
  return $allowed;
}

$id = $_GET['id'] ?? '';
if (!is_string($id) || !preg_match('/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/', $id)) answer(400, ['error' => 'not a station id']);

$dir = sys_get_temp_dir() . CACHE_DIR;
if (!is_dir($dir)) @mkdir($dir, 0700);
$cacheFile = "$dir/$id.json";
$cache = json_decode((string) @file_get_contents($cacheFile), true) ?: [];
if (time() - ($cache['titleAt'] ?? 0) < TITLE_FOR) answer(200, $cache['answer'], TITLE_FOR);
if (!mayRead()) answer(429, ['error' => 'busy']);

if (time() - ($cache['urlAt'] ?? 0) >= URL_FOR || empty($cache['url'])) {
  $cache['url'] = stationUrl($id);
  $cache['urlAt'] = time();
}
$result = $cache['url'] ? readMetadata($cache['url']) : null;
$metadata = $result['metadata'] ?? null;
if ($metadata !== null && !preg_match('//u', $metadata)) $metadata = mb_convert_encoding($metadata, 'UTF-8', 'ISO-8859-1'); // older streams
$cache['answer'] = ['supported' => (bool) $result, 'metadata' => $metadata === null ? null : substr($metadata, 0, 1000)];
$cache['titleAt'] = time();
file_put_contents($cacheFile, json_encode($cache, JSON_INVALID_UTF8_SUBSTITUTE), LOCK_EX);
answer(200, $cache['answer'], TITLE_FOR);
