import React, { useState } from 'react';
import { Quote } from '../types/crm';
import { generateAIAssistedProposal } from '../utils/smartRoofingEngine';
import { 
  Sparkles, 
  X, 
  Building, 
  HardHat, 
  Home, 
  Check, 
  Copy, 
  RotateCcw,
  Sliders,
  Send
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeQuote: Quote;
  currentLetterText: string;
  onApplyLetter: (newLetter: string) => void;
}

export const SmartProposalAIPolisherModal: React.FC<Props> = ({
  isOpen,
  onClose,
  activeQuote,
  currentLetterText,
  onApplyLetter
}) => {
  if (!isOpen) return null;

  const [clientType, setClientType] = useState<'architect' | 'commercial_contractor' | 'homeowner'>('architect');
  const [tone, setTone] = useState<'rigorous' | 'premium' | 'collaborative'>('premium');
  const [generatedText, setGeneratedText] = useState<string>(currentLetterText);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [copiedToast, setCopiedToast] = useState<boolean>(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await generateAIAssistedProposal({
        quote: activeQuote,
        clientType,
        tone
      });
      setGeneratedText(result);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedText);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 3000);
  };

  const handleApply = () => {
    onApplyLetter(generatedText);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-2xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-slate-800 to-sky-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-500/20 text-sky-400 rounded-lg border border-sky-400/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">AI Proposal Narrative &amp; Cover Letter Polisher</h3>
              <p className="text-[11px] text-slate-300">
                Crafts bespoke architectural cover letters tailored for specific client personas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Persona Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-bold text-slate-800 block">Target Client Persona &amp; Project Type</label>
              <span className="text-[10px] text-slate-500 font-medium">All Profiled Metal Roofing (Re-Roofs to Bespoke)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div
                onClick={() => setClientType('homeowner')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  clientType === 'homeowner'
                    ? 'border-amber-600 bg-amber-50/70 ring-1 ring-amber-500 text-amber-950'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 font-bold mb-1">
                  <Home className="w-4 h-4 text-amber-600" />
                  <span>Residential Re-Roof</span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Turnkey peace of mind: weather-tight daily staging, skip bins, WorkSafe edge protection, magnetic nail sweep, and 10-yr guarantee.
                </p>
              </div>

              <div
                onClick={() => setClientType('architect')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  clientType === 'architect'
                    ? 'border-sky-600 bg-sky-50 ring-1 ring-sky-500 text-sky-950'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 font-bold mb-1">
                  <Building className="w-4 h-4 text-sky-600" />
                  <span>Architectural Bespoke</span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Focus on crisp shadow lines, concealed 316 cleats, NZBC E2/AS1 conformance, custom flashings, and Marcus Kuhtze LBP sign-off.
                </p>
              </div>

              <div
                onClick={() => setClientType('commercial_contractor')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  clientType === 'commercial_contractor'
                    ? 'border-sky-600 bg-sky-50 ring-1 ring-sky-500 text-sky-950'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 font-bold mb-1">
                  <HardHat className="w-4 h-4 text-slate-700" />
                  <span>Commercial / Main GC</span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Focus on NZ Construction Contracts Act (CCA 2002) claims, SSSP safety registers, PS3 producer statements, and crane logistics.
                </p>
              </div>
            </div>
          </div>

          {/* Tone Selector */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700 text-xs">Tone:</span>
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setTone('premium')}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                    tone === 'premium' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Refined Architectural
                </button>
                <button
                  type="button"
                  onClick={() => setTone('rigorous')}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                    tone === 'rigorous' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Technical &amp; Rigorous
                </button>
                <button
                  type="button"
                  onClick={() => setTone('collaborative')}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                    tone === 'collaborative' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Approachable
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-3.5 py-1.5 bg-sky-700 hover:bg-sky-800 text-white font-bold rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isGenerating ? 'Writing Proposal Narrative...' : 'Generate with Gemini AI'}</span>
            </button>
          </div>

          {/* Textarea for preview and edits */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-bold text-slate-800">Executive Proposal Cover Letter</label>
              <button
                type="button"
                onClick={handleCopy}
                className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedToast ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
            <textarea
              rows={8}
              value={generatedText}
              onChange={(e) => setGeneratedText(e.target.value)}
              className="w-full p-3 border border-slate-300 rounded-xl font-sans text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-600 leading-relaxed"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500">
            Updates the client portal executive cover letter block.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply to Proposal</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
