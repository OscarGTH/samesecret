/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ShieldCheck, HelpCircle, X, CheckSquare, Info, ShieldAlert } from 'lucide-react';

interface NavbarProps {
  onNavigate: (view: 'home' | 'create' | 'join') => void;
  currentView: string;
}

export default function Navbar({ onNavigate, currentView }: NavbarProps) {
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  return (
    <>
      <header className="fixed top-0 left-0 w-full z-40 flex justify-between items-center px-6 h-14 bg-[#0C0C0C]/80 backdrop-blur-md border-b border-white/5 shadow-sm">
        <div 
          onClick={() => onNavigate('home')} 
          className="flex items-center gap-2 cursor-pointer group select-none"
        >
          <ShieldCheck className="w-5 h-5 text-[#D4AF37]" />
          <h1 className="font-heading italic text-[#D4AF37] tracking-tight text-lg group-hover:brightness-110 transition-all">
            samesecret
          </h1>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          <button 
            onClick={() => onNavigate('home')}
            className={`font-sans text-xs uppercase tracking-wider font-semibold transition-colors ${
              currentView === 'home' ? 'text-[#D4AF37]' : 'text-white/50 hover:text-white'
            }`}
          >
            Home
          </button>
          <button 
            onClick={() => setShowHowItWorks(true)}
            className="font-sans text-xs uppercase tracking-wider text-white/50 hover:text-white font-semibold transition-colors"
          >
            Security &amp; FAQ
          </button>
        </nav>

        <button 
          onClick={() => setShowHowItWorks(true)}
          className="flex items-center gap-1.5 h-9 px-4 rounded-md border border-[#D4AF37]/30 text-xs font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-all active:scale-95 cursor-pointer"
        >
          <HelpCircle className="w-4 h-4 text-[#D4AF37]" />
          <span>How it works</span>
        </button>
      </header>

      {/* How it works slide-over / details modal */}
      {showHowItWorks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-xl bg-[#0C0C0C] rounded-sm border border-white/5 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-6 border-b border-white/5 bg-black/20">
              <div className="flex items-center gap-2 text-[#D4AF37]">
                <ShieldCheck className="w-5 h-5" />
                <h3 className="font-heading italic text-lg text-[#D4AF37]">How samesecret Works</h3>
              </div>
              <button 
                onClick={() => setShowHowItWorks(false)}
                className="p-1 rounded-full hover:bg-white/5 transition-colors text-white/40 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
 
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-[#E5E5E5] text-left">
              <div>
                <h4 className="font-heading italic text-base text-[#D4AF37] mb-2">
                  1. Zero-Knowledge Proof Client-Side
                </h4>
                <p className="text-white/60 text-xs leading-relaxed">
                  samesecret uses a Zero-Knowledge proof algorithm. Your secret is cleaned and normalized in the browser, then used as a private exponent for multi-party cryptographic calculations. Neither your raw secret nor plain hashes are ever transmitted.
                </p>
              </div>

              <div>
                <h4 className="font-heading italic text-base text-[#D4AF37] mb-2">
                  2. Socialist Millionaire Protocol (SMP)
                </h4>
                <p className="text-white/60 text-xs leading-relaxed">
                  Using 1024-bit MODP Group modular exponents (RFC 2409), both browsers double-blind their inputs and run the Socialist Millionaire handshake. The server simply relays randomized blinding tokens (<code className="text-[#D4AF37]">A</code>, <code className="text-[#D4AF37]">B</code>, <code className="text-[#D4AF37]">CB</code>, <code className="text-[#D4AF37]">CA</code>). Because of this cryptography, nobody can reconstruct your inputs or reverse-engineer the match.
                </p>
              </div>

              <div>
                <h4 className="font-heading italic text-base text-[#D4AF37] mb-2">
                  3. Automated Normalization Templates
                </h4>
                <p className="text-white/60 text-xs leading-relaxed">
                  Secrets must match symbol-for-symbol. To remove frustrating discrepancies (like typos, accent variants, or trailing tabs), choose our pre-baked schemas for names, numbers, email IDs, or dates to seamlessly unify data inputs on both ends.
                </p>
              </div>

              <div className="p-4 bg-[#D4AF37]/5 border border-[#D4AF37]/20 rounded-sm flex gap-3 text-white/80">
                <ShieldAlert className="w-5 h-5 text-[#D4AF37] shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-sans font-bold text-[#D4AF37] block mb-1">Ephemeral Session Safeguards</span>
                  If enabled, checking rooms self-destruct automatically 10 seconds after a match attempt or within 24 hours. No traces or server logs remain.
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-white/5 bg-black/20 flex justify-end">
              <button 
                onClick={() => setShowHowItWorks(false)}
                className="px-6 py-2 border border-[#D4AF37]/40 text-[#D4AF37] text-xs font-semibold rounded hover:bg-[#D4AF37] hover:text-black transition-all active:scale-95"
              >
                Got it, stay secure
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
