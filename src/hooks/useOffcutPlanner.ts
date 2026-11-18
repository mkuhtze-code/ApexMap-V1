import { useState, useEffect, useRef, useCallback } from 'react';
import { FaceInput, Config, Dir, Plan, planRoof, DEFAULTS } from '../lib/offcutEngine';

export interface UseOffcutPlannerReturn {
  plan: Plan | null;
  status: 'idle' | 'solving' | 'done' | 'error';
  isSolving: boolean;
  error: string | null;
  solveDurationMs: number;
  triggerSolve: (faces: FaceInput[], config?: Partial<Config>, fixedDirs?: Record<string, Dir>) => void;
}

export function useOffcutPlanner(
  initialFaces?: FaceInput[],
  initialConfig?: Partial<Config>,
  initialFixedDirs?: Record<string, Dir>
): UseOffcutPlannerReturn {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [status, setStatus] = useState<'idle' | 'solving' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [solveDurationMs, setSolveDurationMs] = useState<number>(0);

  const workerRef = useRef<Worker | null>(null);
  const debounceTimerRef = useRef<any>(null);
  const reqIdRef = useRef<number>(0);

  // Initialize Web Worker if supported
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.Worker) {
        const worker = new Worker(new URL('../lib/offcutEngine.worker.ts', import.meta.url), {
          type: 'module'
        });

        worker.onmessage = (e: MessageEvent) => {
          const { success, plan: resultPlan, error: workerErr, requestId } = e.data;
          if (requestId === String(reqIdRef.current)) {
            if (success) {
              setPlan(resultPlan);
              setStatus('done');
              setError(null);
            } else {
              setError(workerErr || 'Calculation failed');
              setStatus('error');
            }
          }
        };

        workerRef.current = worker;
      }
    } catch (err) {
      console.warn('Worker initialization failed, using in-thread fallback:', err);
      workerRef.current = null;
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const triggerSolve = useCallback(
    (faces: FaceInput[], config?: Partial<Config>, fixedDirs?: Record<string, Dir>) => {
      if (!faces || faces.length === 0) return;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      setStatus('solving');
      setError(null);

      debounceTimerRef.current = setTimeout(() => {
        const currentReqId = String(++reqIdRef.current);
        const startTime = performance.now();

        if (workerRef.current) {
          workerRef.current.postMessage({
            faces,
            config,
            fixedDirs,
            requestId: currentReqId
          });
          // Also record duration on finish
          const checkDuration = () => {
            const elapsed = Math.round(performance.now() - startTime);
            setSolveDurationMs(elapsed);
          };
          setTimeout(checkDuration, 400);
        } else {
          // Direct in-thread calculation fallback
          try {
            const computedPlan = planRoof(faces, config, fixedDirs);
            const elapsed = Math.round(performance.now() - startTime);
            setSolveDurationMs(elapsed);
            setPlan(computedPlan);
            setStatus('done');
          } catch (err: any) {
            setError(err?.message || 'Plan calculation failed');
            setStatus('error');
          }
        }
      }, 150);
    },
    []
  );

  // Auto trigger on initial faces if provided
  useEffect(() => {
    if (initialFaces && initialFaces.length > 0) {
      triggerSolve(initialFaces, initialConfig, initialFixedDirs);
    }
  }, []);

  return {
    plan,
    status,
    isSolving: status === 'solving',
    error,
    solveDurationMs,
    triggerSolve
  };
}
