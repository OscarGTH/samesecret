/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';

interface JoinCheckProps {
  onRoomSelected: (roomData: any) => void;
  onHome: () => void;
  initialCode?: string;
}

export default function JoinCheck({ onRoomSelected, onHome, initialCode = '' }: JoinCheckProps) {
  const [code, setCode] = useState<string[]>(Array(6).fill(''));
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    if (initialCode && initialCode.length === 6) {
      setCode(initialCode.toUpperCase().split(''));
    }
  }, [initialCode]);

  const handleInputChange = (element: HTMLInputElement, index: number) => {
    const val = element.value.toUpperCase();
    if (/[^A-Z0-9]/.test(val)) return;

    const newCode = [...code];
    newCode[index] = val;
    setCode(newCode);
    setErrorMsg('');

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
      pastedData.split('').forEach((char, idx) => { newCode[idx] = char; });
      setCode(newCode);
      inputRefs[Math.min(pastedData.length, 5)].current?.focus();
    }
  };

  const handleJoin = async () => {
    setErrorMsg('');
    const fullCode = code.join('').toUpperCase();
    if (fullCode.length < 6) {
      setErrorMsg('Please enter the complete 6-character access code.');
      return;
    }

    setLoading(true);
    try {
      const { api } = await import('../lib/api');
      const res = await fetch(api(`/api/rooms/${fullCode}`));
      if (!res.ok) throw new Error('Room not found or has expired.');
      const roomData = await res.json();
      onRoomSelected(roomData);
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-4 animate-fade-in text-center my-2 md:my-6">
      <div className="glass-card p-6 rounded-sm shadow-2xl relative text-left border border-white/5">
        <div className="text-center mb-6">
          <h1 className="font-heading italic text-white text-xl md:text-2xl mb-1.5">
            Join Secret Check
          </h1>
          <p className="font-sans text-xs text-white/50 leading-relaxed max-w-[280px] mx-auto">
            Enter the 6-character code from the invitation link.
          </p>
        </div>

        {errorMsg && (
          <div className="p-4 mb-4 bg-red-950/40 border-l-4 border-red-500 rounded-sm text-xs font-semibold text-red-300">
            {errorMsg}
          </div>
        )}

        <div className="mb-6 space-y-3">
          <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest text-center">
            Access Code
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

        <button
          onClick={handleJoin}
          disabled={loading}
          className="w-full h-11 bg-[#D4AF37] border border-[#D4AF37] text-black hover:bg-transparent hover:text-[#D4AF37] font-heading font-semibold text-xs tracking-wider uppercase rounded-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:bg-white/10 disabled:text-white/30"
        >
          {loading ? 'Looking up room...' : 'Join Check'}
        </button>

        <p className="mt-4 text-center font-sans text-[10px] text-white/30 leading-relaxed">
          Your secret never leaves your device in plain text.
        </p>
      </div>
    </div>
  );
}
