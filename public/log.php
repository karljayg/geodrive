<?php
// Keeps a performance log from the game's Send log button. The logs sit outside the deployed folder, which each
// deploy mirrors, in a folder scripts/deploy.sh closes to the web. Fetch them with `npm run logs`.
const LOG_DIR = __DIR__ . '/../geodrive-logs';
const MAX_LOG = 3000000;        // bytes in one log; five hours of rows is well under this
const MAX_TOTAL = 200000000;    // bytes held in all, as anyone can press the button

function answer($status, $body) {
  http_response_code($status);
  header('Content-Type: application/json');
  echo json_encode($body);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') answer(405, ['error' => 'POST only']);
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== $_SERVER['HTTP_HOST']) answer(403, ['error' => 'wrong site']);

$body = file_get_contents('php://input', false, null, 0, MAX_LOG + 1);
if (strlen($body) > MAX_LOG) answer(413, ['error' => 'too large']);
$log = json_decode($body);
if (!is_object($log) || !isset($log->rows) || !is_array($log->rows)) answer(400, ['error' => 'not a log']);

$held = 0;
foreach (glob(LOG_DIR . '/*.json') ?: [] as $file) $held += filesize($file);
if ($held + strlen($body) > MAX_TOTAL) answer(507, ['error' => 'log storage is full']);

$name = gmdate('Y-m-d_His') . '_' . bin2hex(random_bytes(3)) . '.json';
if (file_put_contents(LOG_DIR . '/' . $name, $body, LOCK_EX) === false) answer(500, ['error' => 'could not save']);
answer(200, ['name' => $name, 'rows' => count($log->rows)]);
