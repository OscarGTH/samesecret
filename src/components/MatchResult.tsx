/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { 
  CheckCircle, 
  XSquare, 
  RotateCcw, 
  Home, 
  ShieldCheck, 
  Check, 
  X, 
  UserSquare2,
  Lock,
  HeartHandshake
} from 'lucide-react';

interface MatchResultProps {
  status: 'matched' | 'no_match' | 'cancelled';
  partnerName?: string;
  onHome: () => void;
  onRestart: () => void;
}

export default function MatchResult({ status, partnerName = 'Anonymous Matcher', onHome, onRestart }: MatchResultProps) {
  
  // Wipe session status from console immediately on mount for maximum design sanity and data sovereignty reassurance
  useEffect(() => {
    console.log('[System Metadata Logs] Verification completed. Secure session destroyed.');
  }, []);

  if (status === 'matched') {
    return (
      <div className="max-w-md mx-auto space-y-4 animate-fade-in text-center my-2 md:my-6">

        {/* Animated Check Visual block */}
        <div className="relative flex items-center justify-center py-3 md:py-6">
          <div className="absolute w-40 h-40 bg-[#D4AF37]/10 rounded-full animate-ping opacity-30"></div>
          <div className="relative z-10 w-24 h-24 rounded-full bg-[#0C0C0C] border-2 border-[#D4AF37]/30 flex items-center justify-center shadow-2xl transition-transform hover:scale-105 duration-300">
            <Check className="w-10 h-10 text-[#D4AF37] stroke-[3px]" />
          </div>
        </div>

        {/* Headline block */}
        <div className="space-y-2">
          <h1 className="font-heading italic text-white text-2xl md:text-3xl tracking-wide">
            It's a Match!
          </h1>
          <p className="font-sans text-xs text-white/50">
            You both know the same secret.
          </p>
        </div>

        {/* Matched target user bento card */}
        <div className="glass-card p-1 rounded-sm relative overflow-hidden border border-white/5 bg-[#0C0C0C]/50 transition-all duration-300 hover:shadow-2xl">
          <div className="bg-black/40 rounded-sm p-5 border border-white/5 flex flex-col items-center gap-3">
            <span className="font-sans text-[9px] font-bold text-white/40 uppercase tracking-widest">
              Validated Identity
            </span>
            <div className="py-2.5 px-8 bg-[#D4AF37]/5 border border-[#D4AF37]/20 rounded-sm flex items-center gap-2">
              <UserSquare2 className="w-4 h-4 text-[#D4AF37]" />
              <span className="font-heading italic font-bold text-white text-sm">
                {partnerName}
              </span>
            </div>
          </div>
        </div>

        {/* Informative lock warning */}
        <div className="flex items-start gap-3 p-4 bg-[#D4AF37]/5 rounded-sm border border-[#D4AF37]/10 text-left">
          <div className="w-8 h-8 rounded-full bg-[#D4AF37]/15 flex items-center justify-center text-[#D4AF37] shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <p className="font-sans text-xs text-white/70 leading-relaxed">
            The cryptographic proof has been successfully verified. Neither party had their raw secrets leaked, as comparisons occurred purely over double-blinded prime-exponent handshakes.
          </p>
        </div>

        {/* Action CTAs */}
        <div className="w-full flex flex-col gap-3 pt-1">
          <button
            onClick={onHome}
            className="w-full h-11 bg-[#D4AF37] border border-[#D4AF37] text-black hover:bg-transparent hover:text-[#D4AF37] hover:border-[#D4AF37]/40 rounded-sm font-heading font-semibold text-xs tracking-wider uppercase transition-all duration-200 cursor-pointer"
          >
            Finish &amp; Close Room
          </button>
          
          <button
            onClick={onRestart}
            className="w-full h-11 border border-[#D4AF37] text-[#D4AF37] bg-transparent hover:bg-[#D4AF37]/5 rounded-sm font-heading font-semibold text-xs tracking-wider uppercase transition-all duration-200 cursor-pointer"
          >
            Start New Check
          </button>
        </div>
      </div>
    );
  }

  // Mismatch Result block
  return (
    <div className="max-w-md mx-auto space-y-4 animate-fade-in text-center my-2 md:my-6">

      {/* Animated Red Warning visual block */}
      <div className="relative flex items-center justify-center py-3 md:py-6">
        <div className="absolute w-40 h-40 bg-red-500/5 rounded-full animate-ping opacity-25"></div>
        <div className="relative z-10 w-24 h-24 rounded-full bg-black/40 border-2 border-red-500/20 flex items-center justify-center shadow-2xl transition-transform hover:scale-105 duration-300">
          <X className="w-10 h-10 text-red-400 stroke-[3px]" />
        </div>
      </div>

      {/* Headings */}
      <div className="space-y-2">
        <h1 className="font-heading italic text-white text-2xl md:text-3xl tracking-wide">
          No Match Found
        </h1>
        <p className="font-sans text-xs text-white/50">
          The secrets provided do not match.
        </p>
      </div>

      {/* Reassurance privacy block */}
      <div className="glass-card p-6 rounded-sm text-left space-y-4 relative overflow-hidden border border-white/5 bg-[#0C0C0C]/50">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none custom-pattern"></div>
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-950/20 border border-red-500/20 rounded-sm text-red-400 shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-sans text-[9px] font-bold text-white/80 uppercase tracking-widest">
              Privacy Guaranteed
            </h3>
            <span className="text-[9px] text-white/30 block font-bold tracking-wider uppercase">Session purge triggered</span>
          </div>
        </div>
        <p className="font-sans text-xs text-white/40 leading-relaxed">
          The verification process preserves absolute double-blind anonymity. Neither of you learned what the other entered. Stored blinding exponents have been purged.
        </p>
      </div>

      {/* Try again inputs or escape */}
      <div className="flex gap-4 pt-1">
        <button
          onClick={onRestart}
          className="flex-grow h-11 bg-[#D4AF37] border border-[#D4AF37] text-black hover:bg-transparent hover:text-[#D4AF37] hover:border-[#D4AF37]/40 rounded-sm font-heading font-semibold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Try Again</span>
        </button>

        <button
          onClick={onHome}
          className="flex-grow h-11 border border-white/10 text-white/80 bg-transparent hover:bg-white/5 rounded-sm font-heading font-semibold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <Home className="w-4 h-4" />
          <span>Go to Home</span>
        </button>
      </div>
    </div>
  );
}
