import React, { useState } from 'react';
import { Download, Share, PlusSquare, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface Props {
  compact?: boolean;
  darkTheme?: boolean;
}

export const PWAInstallButton: React.FC<Props> = ({
  compact = false,
  darkTheme = true
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Hide when already running inside standalone installed PWA
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop native install trigger
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={
          compact
            ? 'px-2.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-[11px] shadow-md transition-all cursor-pointer flex items-center gap-1.5 shrink-0'
            : 'px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5 shrink-0'
        }
        title="Install Exact Roofing Engine as an App"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{compact ? 'Install' : 'Install App'}</span>
      </button>
    );
  }

  // iOS Safari or fallback guide when beforeinstallprompt isn't fired yet
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowGuideModal(true)}
          className={
            compact
              ? `px-2.5 py-1.5 rounded-xl font-bold text-[11px] border transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                  darkTheme
                    ? 'bg-slate-800 hover:bg-slate-700 text-sky-300 border-sky-500/40'
                    : 'bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-300'
                }`
              : `px-3 py-1.5 rounded-xl font-bold text-xs border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  darkTheme
                    ? 'bg-slate-800 hover:bg-slate-700 text-sky-300 border-sky-500/40'
                    : 'bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-300'
                }`
          }
          title="Install on iPhone / iPad"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>{compact ? 'App' : 'Install on iOS'}</span>
        </button>

        {showGuideModal && (
          <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
            <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-[#0e1526] border border-slate-800 p-5 text-white shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-sky-400" />
                  <h3 className="text-sm font-extrabold text-white">
                    Install ExactRoof on iPhone / iPad
                  </h3>
                </div>
                <button
                  onClick={() => setShowGuideModal(false)}
                  className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-300">
                <div className="flex items-start gap-3 bg-slate-900/90 border border-slate-800 p-3 rounded-2xl">
                  <div className="p-2 rounded-xl bg-sky-500/15 text-sky-400 shrink-0">
                    <Share className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-white">1. Tap Share in Safari</div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Look for the Share icon at the bottom or top bar of Safari.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-900/90 border border-slate-800 p-3 rounded-2xl">
                  <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 shrink-0">
                    <PlusSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-white">2. Add to Home Screen</div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Scroll down and tap <strong>Add to Home Screen</strong> to run Exact Roofing Engine full-screen offline.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowGuideModal(false)}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
