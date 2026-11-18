import { planRoof, FaceInput, Config, Dir } from './offcutEngine';

self.onmessage = (e: MessageEvent<{
  faces: FaceInput[];
  config?: Partial<Config>;
  fixedDirs?: Record<string, Dir>;
  requestId: string;
}>) => {
  const { faces, config, fixedDirs, requestId } = e.data;
  try {
    const plan = planRoof(faces, config, fixedDirs);
    self.postMessage({ success: true, plan, requestId });
  } catch (err: any) {
    self.postMessage({ success: false, error: err?.message || 'Plan calculation failed', requestId });
  }
};
