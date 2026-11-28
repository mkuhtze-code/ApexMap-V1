import type { EnvelopeIntent } from './types';
import {
  applyDiagnosisMerge,
  buildTriageDiagnosisPayload,
  sanitizeTriageDiagnosis,
  type TriageDiagnosis,
  type TriageDiagnosisAction,
  type TriageDiagnosisPayload,
  type TriageDiagnosisRole,
  type TriageSkeletonPolicy
} from './triageDiagnosisShared';

export type {
  TriageDiagnosis,
  TriageDiagnosisAction,
  TriageDiagnosisPayload,
  TriageDiagnosisRole,
  TriageSkeletonPolicy
};
export { applyDiagnosisMerge, buildTriageDiagnosisPayload, sanitizeTriageDiagnosis };

export interface DiagnoseWithGeminiOptions {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Text-only Gemini diagnosis client for Plan Triage.
 * Sends scrubbed structured vector/text facts (never PDF bytes) to the server proxy route.
 * Never mutates outline geometry; returns null cleanly when API key is missing, offline, or failed.
 */
export async function diagnoseWithGemini(
  draft: EnvelopeIntent,
  options?: DiagnoseWithGeminiOptions
): Promise<TriageDiagnosis | null> {
  if (typeof fetch !== 'function') {
    return null;
  }

  const endpoint = options?.endpoint ?? '/api/ai/plan-triage-diagnose';
  // Relative URLs require a browser origin (skip cleanly in headless Node unit tests unless endpoint is absolute)
  if (endpoint.startsWith('/') && typeof window === 'undefined') {
    return null;
  }

  const payload = buildTriageDiagnosisPayload(draft);
  const timeoutMs = options?.timeoutMs ?? 15000;
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const forwardAbort = () => controller.abort();
  if (options?.signal) {
    if (options.signal.aborted) {
      clearTimeout(timer);
      return null;
    }
    options.signal.addEventListener('abort', forwardAbort, { once: true });
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload,
        ...(options?.model ? { model: options.model } : {})
      }),
      signal: controller.signal
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { diagnosis?: unknown; available?: boolean };
    if (!data || !data.diagnosis) return null;
    return sanitizeTriageDiagnosis(data.diagnosis, payload);
  } catch (err) {
    if (!timedOut && !(err instanceof DOMException && err.name === 'AbortError')) {
      console.warn('Plan Triage Gemini diagnosis unavailable:', err);
    }
    return null;
  } finally {
    clearTimeout(timer);
    if (options?.signal) {
      options.signal.removeEventListener('abort', forwardAbort);
    }
  }
}
