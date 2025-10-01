export function maskSecretsFn(input: string): string {
  let t = input;
  // PEM blocks
  t = t.replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "<SECRET:PEM>");
  // JWT (rough)
  t = t.replace(/\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, "<SECRET:JWT>");
  // Firebase API key
  t = t.replace(/\bAIza[0-9A-Za-z\-_]{35}\b/g, "<SECRET:FIREBASE_API_KEY>");
  // Generic KEY/SECRET/TOKEN assignments
  t = t.replace(/\b(API[_-]?KEY|SECRET|TOKEN|ACCESS[_-]?TOKEN)\s*[:=]\s*["']?([A-Za-z0-9_\-\.]{16,})["']?/gi,
                (_m, k) => `<SECRET:${String(k).toUpperCase()}>`);
  // Bearer tokens
  t = t.replace(/\bBearer\s+[A-Za-z0-9\-\._~\+\/]+=*/gi, "<SECRET:BEARER>");
  // GitHub PATs (ghp_, gho_, github_pat_)
  t = t.replace(/\b(ghp|gho)_[A-Za-z0-9]{36,}\b/gi, "<SECRET:GITHUB_PAT>");
  t = t.replace(/\bgithub_pat_[A-Za-z0-9_]{60,}\b/gi, "<SECRET:GITHUB_PAT>");
  // Slack tokens
  t = t.replace(/\bxox[baprs]-[A-Za-z0-9\-]{10,}\b/gi, "<SECRET:SLACK_TOKEN>");
  // AWS access keys (very rough)
  t = t.replace(/\bAKIA[0-9A-Z]{16}\b/g, "<SECRET:AWS_ACCESS_KEY_ID>");
  // Query params commonly carrying secrets
  t = t.replace(/([?&](sig|signature|token|X-Amz-Signature|access_token|id_token))=[A-Za-z0-9%\-_.~+/=]+/gi,
                (_m, p) => `${p}=<SECRET:QUERY_TOKEN>`);
  return t;
}
