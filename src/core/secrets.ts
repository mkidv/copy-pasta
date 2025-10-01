export function maskSecretsFn(input: string): string {
  let t = input;
  t = t.replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "<SECRET:PEM>");
  t = t.replace(/\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, "<SECRET:JWT>");
  t = t.replace(/\bAIza[0-9A-Za-z\-_]{35}\b/g, "<SECRET:FIREBASE_API_KEY>");
  t = t.replace(/\b(API[_-]?KEY|SECRET|TOKEN|ACCESS[_-]?TOKEN)\s*[:=]\s*["']?([A-Za-z0-9_\-\.]{16,})["']?/gi,
                (_m, k) => `<SECRET:${String(k).toUpperCase()}>`);
  t = t.replace(/([?&](sig|signature|token|X-Amz-Signature))=[A-Za-z0-9%\-_.]+/gi,
                (_m, p) => `${p}=<SECRET:SIGNATURE>`);
  return t;
}
