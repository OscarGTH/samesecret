/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, Camera, CheckSquare, Sparkles, X, Scan } from 'lucide-react';

interface JoinCheckProps {
  onRoomSelected: (roomData: any) => void;
  onHome: () => void;
  initialCode?: string;
}

export default function JoinCheck({ onRoomSelected, onHome, initialCode = '' }: JoinCheckProps) {
  const [code, setCode] = useState<string[]>(Array(6).fill(''));
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  
  // Refs for sequential OTP inputs
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Prepopulate if code is provided via URL parameter
  useEffect(() => {
    if (initialCode && initialCode.length === 6) {
      const parts = initialCode.toUpperCase().split('');
      setCode(parts);
    }
  }, [initialCode]);

  const handleInputChange = (element: HTMLInputElement, index: number) => {
    const val = element.value.toUpperCase();
    if (/[^A-Z0-9]/.test(val)) return; // Only allow alphanumeric chars

    const newCode = [...code];
    newCode[index] = val;
    setCode(newCode);

    setErrorMsg('');

    // Advance focus sequentially
    if (val && index < 5) {
      inputRefs[index + 1].current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      const newCode = [...code];
      newCode[index - 1] = '';
      setCode(newCode);
      inputRefs[index - 1].current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').toUpperCase().trim().substring(0, 6);
    if (/^[A-Z0-9]{1,6}$/.test(pastedData)) {
      const newCode = Array(6).fill('');
      pastedData.split('').forEach((char, idx) => {
        newCode[idx] = char;
      });
      setCode(newCode);
      inputRefs[Math.min(pastedData.length, 5)].current?.focus();
    }
  };

  const handleJoin = async () => {
    setErrorMsg('');
    const fullCode = code.join('').toUpperCase();
    if (fullCode.length < 6) {
      setErrorMsg('Please specify the complete 6-character Access Code.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/${fullCode}`);
      if (!res.ok) {
        throw new Error('Secret Room session not found, or it has expired.');
      }

      const roomData = await res.json();
      onRoomSelected(roomData);
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected transport issue occurred.');
    } finally {
      setLoading(false);
    }
  };

  // Simulate scanning of QR codes for responsive mock triggers
  const handleSimulateScan = async (scannedCode: string) => {
    setShowQRScanner(false);
    setCode(scannedCode.split(''));
    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/${scannedCode}`);
      if (!res.ok) {
        throw new Error('Secret Room session not found, or it has expired.');
      }
      const roomData = await res.json();
      onRoomSelected(roomData);
    } catch (err: any) {
      setErrorMsg(err.message || 'Scanned link is invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto items-center justify-center space-y-6 animate-fade-in text-center my-6">
      {/* Container header card */}
      <div className="glass-card p-6 rounded-sm shadow-2xl relative text-left border border-white/5">
        <div className="text-center mb-6">
          <h1 className="font-heading italic text-white text-xl md:text-2xl mb-1.5">
            Join Secret Check
          </h1>
          <p className="font-sans text-xs text-white/50 leading-relaxed max-w-[280px] mx-auto">
            Enter the unique code provided to you or scan the shared QR code to begin.
          </p>
        </div>

        {errorMsg && (
          <div className="p-4 mb-4 bg-red-950/40 border-l-4 border-red-500 rounded-sm text-xs font-semibold text-red-300">
            {errorMsg}
          </div>
        )}

        {/* Access Code inputs */}
        <div className="mb-6 space-y-3">
          <label className="block text-[9px] font-bold text-white/40 uppercase tracking-widest text-center">
            6-Character Access Code
          </label>
          
          <div className="flex justify-between gap-1 sm:gap-2 max-w-sm mx-auto" onPaste={handlePaste}>
            {code.map((char, index) => (
              <input
                key={index}
                ref={inputRefs[index]}
                type="text"
                maxLength={1}
                value={char}
                onChange={(e) => handleInputChange(e.target, index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className="w-9 h-11 sm:w-11 sm:h-14 border border-zinc-500 hover:border-zinc-400 rounded-sm text-center text-base sm:text-xl font-mono font-bold text-white focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/50 focus:bg-zinc-950 outline-none transition-all uppercase bg-[#080808]/90 shadow-inner flex-1"
              />
            ))}
          </div>
        </div>

        {/* Dynamic CTAs */}
        <button
          onClick={handleJoin}
          disabled={loading}
          className="w-full h-11 bg-[#D4AF37] border border-[#D4AF37] text-black hover:bg-transparent hover:text-[#D4AF37] hover:border-[#D4AF37]/40 font-heading font-semibold text-xs tracking-wider uppercase rounded-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:bg-white/10 disabled:text-white/30"
        >
          {loading ? 'Decrypting Access Portal...' : 'Join Check'}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="h-px bg-white/10 flex-grow"></div>
          <span className="font-mono text-[9px] text-white/30 uppercase tracking-widest leading-none">OR</span>
          <div className="h-px bg-white/10 flex-grow"></div>
        </div>

        {/* Camera capture trigger */}
        <button
          onClick={() => setShowQRScanner(true)}
          className="w-full h-11 border border-[#D4AF37] text-[#D4AF37] bg-transparent font-heading font-semibold text-xs tracking-wider uppercase rounded-sm flex items-center justify-center gap-2 hover:bg-[#D4AF37]/5 active:scale-95 transition-all cursor-pointer"
        >
          <Camera className="w-4 h-4" />
          <span>Scan QR Code</span>
        </button>

        <p className="mt-6 text-center font-sans text-[10px] text-white/30 leading-relaxed">
          Your connection is end-to-end encrypted. No plain secrets leave your device until a match is confirmed.
        </p>
      </div>

      {/* Simulated Scanner Dialog */}
      {showQRScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#0C0C0C] border border-white/10 rounded-sm shadow-2xl overflow-hidden flex flex-col p-6 space-y-6 text-center animate-fade-in relative">
            <button 
              onClick={() => setShowQRScanner(false)}
              className="absolute right-4 top-4 p-1.5 bg-white/5 rounded-sm text-white/50 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <h3 className="font-heading italic text-white text-base">QR Scanning Scanner</h3>
              <p className="font-sans text-[10px] text-white/40">Position the pairing QR Check directly in front of your camera.</p>
            </div>

            {/* Simulated viewfinder UI box */}
            <div className="relative w-full aspect-square max-w-[220px] mx-auto rounded-sm border border-white/5 overflow-hidden bg-black/40 flex items-center justify-center">
              <Scan className="absolute w-12 h-12 text-[#D4AF37] opacity-60 animate-pulse" />
              <div className="absolute inset-0 border-[2px] border-dashed border-[#D4AF37]/40 rounded-sm m-2"></div>
              <div className="absolute top-1/2 left-0 w-full h-0.5 bg-[#D4AF37] animate-[bounce_3s_infinite] shadow-[0_0_8px_rgba(212,175,55,0.8)]"></div>
            </div>

            <div className="space-y-2">
              <p className="font-sans text-[11px] font-semibold text-white/60">Simulate Scan Code:</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleSimulateScan('K7M9P2')}
                  className="px-3 py-2 bg-white/[0.02] border border-white/5 rounded-sm font-mono text-xs font-bold text-[#D4AF37] hover:bg-white/[0.05] active:scale-95 transition-all cursor-pointer"
                >
                  Code: K7M9P2
                </button>
                <button
                  onClick={() => handleSimulateScan('Z9X4W1')}
                  className="px-3 py-2 bg-white/[0.02] border border-white/5 rounded-sm font-mono text-xs font-bold text-[#D4AF37] hover:bg-white/[0.05] active:scale-95 transition-all cursor-pointer"
                >
                  Code: Z9X4W1
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
