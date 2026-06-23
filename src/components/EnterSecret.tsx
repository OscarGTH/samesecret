/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Eye,
  Lock,
  Sparkles,
  AlertCircle,
  CheckCircle,
  KeyRound,
  RefreshCw,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { RoomState } from '../types';
import { normalizeSecret, decryptAES, encryptAES, generateNickname } from '../utils/crypto';
import { generatePrivateExponent, hashToGroupElement, modPow, P } from '../utils/smp';
import { api } from '../lib/api';

interface EnterSecretProps {
  room: RoomState;
  onJoinComplete: (status: 'matched' | 'no_match' | 'cancelled', partnerName?: string) => void;
  onHome: () => void;
}

export default function EnterSecret({ room, onJoinComplete, onHome }: EnterSecretProps) {
  const [joinerName, setJoinerName] = useState(() => generateNickname());
  const [secret, setSecret] = useState('');
  const [normalizedPreview, setNormalizedPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const personConfig = room.templateConfig?.personFields;
  const showFirstName = personConfig ? personConfig.includeFirstName : true;
  const showLastName = personConfig ? personConfig.includeLastName : true;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const [emailValid, setEmailValid] = useState(true);
  const [isWaitingForFinalize, setIsWaitingForFinalize] = useState(false);

  const [decryptedQuestion, setDecryptedQuestion] = useState('');
  const [decryptionError, setDecryptionError] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(true);
  const [showKeyReveal, setShowKeyReveal] = useState(false);

  // Try to decrypt question on mount
  useEffect(() => {
    let active = true;
    async function attemptDecryption() {
      const hexRegex = /^[0-9a-fA-F]+$/;
      if (!hexRegex.test(room.question) || room.question.length < 24) {
        if (active) { setDecryptedQuestion(room.question); setIsDecrypting(false); }
        return;
      }
      let keyHex = sessionStorage.getItem(`smp_room_key_${room.id}`) || '';
      if (!keyHex) keyHex = sessionStorage.getItem('smp_current_url_key') || '';
      if (!keyHex && window.location.hash) {
        const h = window.location.hash.substring(1);
        if (h.length === 64 && hexRegex.test(h)) keyHex = h;
      }
      if (!keyHex) {
        if (active) { setDecryptionError(true); setIsDecrypting(false); }
        return;
      }
      try {
        const keyBytes = new Uint8Array(keyHex.length / 2);
        for (let i = 0; i < keyBytes.length; i++) keyBytes[i] = parseInt(keyHex.substring(i * 2, i * 2 + 2), 16);
        const cleartext = await decryptAES(room.question, keyBytes);
        sessionStorage.setItem(`smp_room_key_${room.id}`, keyHex);
        if (active) { setDecryptedQuestion(cleartext); setDecryptionError(false); setIsDecrypting(false); }
      } catch {
        if (active) { setDecryptionError(true); setIsDecrypting(false); }
      }
    }
    attemptDecryption();
    return () => { active = false; };
  }, [room.id, room.question]);

  const handleManualKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    let keyHex = manualKey.trim();
    if (keyHex.includes('#')) keyHex = keyHex.split('#')[1];
    if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
      setErrorMsg('Invalid key — must be a 64-character hex string.');
      return;
    }
    try {
      const keyBytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) keyBytes[i] = parseInt(keyHex.substring(i * 2, i * 2 + 2), 16);
      const cleartext = await decryptAES(room.question, keyBytes);
      sessionStorage.setItem(`smp_room_key_${room.id}`, keyHex);
      setDecryptedQuestion(cleartext);
      setDecryptionError(false);
      setShowKeyReveal(false);
      setErrorMsg('');
    } catch {
      setErrorMsg('key: Decryption failed — the key is incorrect.');
    }
  };

  // Restore waiting state from session (e.g. after reload)
  useEffect(() => {
    try {
      if (sessionStorage.getItem(`smp_joiner_submitted_${room.id}`) === 'true') {
        const saved = sessionStorage.getItem(`smp_joiner_name_${room.id}`);
        if (saved) setJoinerName(saved);
        setIsWaitingForFinalize(true);
      }
    } catch {}
  }, [room.id]);

  // Normalization preview
  useEffect(() => {
    const val = room.template === 'Person'
      ? [showFirstName ? firstName : '', showLastName ? lastName : ''].filter(Boolean).join(' ')
      : secret;
    if (!val.trim()) { setNormalizedPreview(''); return; }
    setNormalizedPreview(normalizeSecret(val, room.template, room.caseSensitive, room.ignoreWhitespace));
  }, [secret, firstName, lastName, room]);

  // Poll for finalize result with exponential backoff
  useEffect(() => {
    if (!isWaitingForFinalize || !room?.id) return;
    let active = true;
    let backoffMs = 3000;
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNext = () => { if (active) timeoutId = setTimeout(poll, backoffMs); };

    const poll = async () => {
      try {
        const res = await fetch(api(`/api/rooms/${room.id}/status`));
        if (!res.ok) {
          if (res.status === 429) backoffMs = Math.min(backoffMs * 2, 20000);
          throw new Error('connection lost');
        }
        if (!active) return;
        backoffMs = 3000;
        const data = await res.json();

        if (data.status === 'matched') {
          let creatorName = data.creatorName || room.creatorName || 'Creator';
          const savedKey = sessionStorage.getItem(`smp_room_key_${room.id}`);
          if (savedKey) {
            try {
              const hexRegex = /^[0-9a-fA-F]+$/;
              if (hexRegex.test(creatorName) && creatorName.length >= 24) {
                const kb = new Uint8Array(savedKey.length / 2);
                for (let i = 0; i < kb.length; i++) kb[i] = parseInt(savedKey.substring(i * 2, i * 2 + 2), 16);
                creatorName = await decryptAES(creatorName, kb);
              }
            } catch {}
          }
          return onJoinComplete('matched', creatorName);
        } else if (data.status === 'no_match') {
          return onJoinComplete('no_match');
        } else if (data.status === 'cancelled') {
          return onJoinComplete('cancelled');
        }
      } catch {}
      scheduleNext();
    };

    scheduleNext();
    return () => { active = false; clearTimeout(timeoutId); };
  }, [isWaitingForFinalize, room, onJoinComplete]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!joinerName.trim()) { setErrorMsg('Please enter your display name.'); return; }

    const secretVal = room.template === 'Person'
      ? [showFirstName ? firstName : '', showLastName ? lastName : ''].filter(Boolean).join(' ')
      : secret;

    if (!secretVal.trim()) { setErrorMsg('Please enter your secret.'); return; }
    if (room.template === 'Email' && !emailValid) { setErrorMsg('Please enter a valid email address.'); return; }

    setLoading(true);
    try {
      const finalNormalized = normalizeSecret(secretVal, room.template, room.caseSensitive, room.ignoreWhitespace);
      const keyHex = sessionStorage.getItem(`smp_room_key_${room.id}`) || sessionStorage.getItem('smp_current_url_key') || '';

      let encryptedName = joinerName.trim();
      if (keyHex) {
        try {
          const kb = new Uint8Array(keyHex.length / 2);
          for (let i = 0; i < kb.length; i++) kb[i] = parseInt(keyHex.substring(i * 2, i * 2 + 2), 16);
          encryptedName = await encryptAES(joinerName.trim() || 'Joiner', kb);
        } catch {}
      }

      if (!room.creatorSmpA) throw new Error('Missing creator key — handshake impossible.');
      const H_B = await hashToGroupElement(finalNormalized);
      const privateKeyB = generatePrivateExponent();
      const B = modPow(H_B, privateKeyB, P);
      const C_B = modPow(BigInt(room.creatorSmpA), privateKeyB, P);

      const res = await fetch(api(`/api/rooms/${room.id}/join`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: encryptedName, joinerSmpB: B.toString(), joinerSmpCB: C_B.toString() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Server rejected the request.');
      }

      try {
        const activeRooms = JSON.parse(sessionStorage.getItem('secret_matcher_active_session_rooms') || '[]');
        if (!activeRooms.some((r: any) => r.roomId === room.id)) {
          activeRooms.push({ roomId: room.id, accessCode: room.accessCode, question: decryptedQuestion || room.question, template: room.template, createdAt: Date.now(), role: 'joiner', joinerName: joinerName.trim() });
          sessionStorage.setItem('secret_matcher_active_session_rooms', JSON.stringify(activeRooms));
        }
        sessionStorage.setItem(`smp_joiner_submitted_${room.id}`, 'true');
        sessionStorage.setItem(`smp_joiner_name_${room.id}`, joinerName.trim());
      } catch {}

      setIsWaitingForFinalize(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong.');
      setLoading(false);
    }
  };

  // ── Waiting screen ─────────────────────────────────────────────────────────
  if (isWaitingForFinalize) {
    return (
      <div className="max-w-md mx-auto flex flex-col items-center justify-center space-y-4 animate-fade-in text-center my-2 md:my-12">
        <div className="glass-card p-8 rounded-sm shadow-2xl w-full border border-white/5 bg-[#0C0C0C]/50">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/20">
              <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
            </div>
            <h1 className="font-heading italic text-white text-xl animate-pulse">Encrypted Handshake…</h1>
            <p className="text-xs text-white/40 leading-relaxed max-w-xs mx-auto">
              Waiting for the room creator's browser to complete the zero-knowledge comparison.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const inputDisabled = isDecrypting;

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto space-y-5 animate-fade-in my-2 md:my-6">

      {/* ── Question (hero) ── */}
      {isDecrypting ? (
        <div className="flex items-center gap-3 p-5 glass-card rounded-sm border border-white/5">
          <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37] shrink-0" />
          <span className="text-xs text-white/40">Decrypting question…</span>
        </div>
      ) : decryptionError ? (
        <div className="glass-card rounded-sm border border-white/5 bg-[#0C0C0C]/50 overflow-hidden">
          {/* Encrypted placeholder — non-blocking */}
          <div className="px-6 py-5 border-l-4 border-l-white/10">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="w-3.5 h-3.5 text-white/20 shrink-0" />
              <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest">Question encrypted</p>
            </div>
            <p className="text-white/30 text-sm italic">
              Ask the creator to share the decryption key, or proceed if you already know what you're comparing.
            </p>
            <button
              type="button"
              onClick={() => setShowKeyReveal(v => !v)}
              className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-[#D4AF37]/60 hover:text-[#D4AF37] uppercase tracking-wider transition-colors cursor-pointer"
            >
              <KeyRound className="w-3 h-3" />
              Have a key? Reveal question
              <ChevronDown className={`w-3 h-3 transition-transform ${showKeyReveal ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {showKeyReveal && (
            <div className="px-6 pb-5 border-t border-white/5 pt-4">
              {errorMsg && errorMsg.includes('key') && (
                <p className="text-xs text-red-400 mb-2">{errorMsg}</p>
              )}
              <form onSubmit={handleManualKeySubmit} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste invitation link or 64-char key…"
                  value={manualKey}
                  onChange={(e) => setManualKey(e.target.value)}
                  className="flex-grow h-10 px-3 bg-[#080808]/90 border border-zinc-700 hover:border-zinc-500 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 outline-none text-xs font-mono text-white placeholder-white/20 rounded-sm"
                />
                <button type="submit" className="h-10 px-4 bg-[#D4AF37] text-black font-heading font-semibold text-xs tracking-wider uppercase rounded-sm flex items-center gap-1.5 hover:bg-[#C9A028] transition-all cursor-pointer shrink-0">
                  <KeyRound className="w-3.5 h-3.5" />
                  Reveal
                </button>
              </form>
            </div>
          )}
        </div>
      ) : (
        <div className="glass-card rounded-sm px-6 py-5 border-l-4 border-l-[#D4AF37] border-white/5 bg-[#0C0C0C]/50">
          <p className="text-[10px] font-bold text-[#D4AF37]/70 uppercase tracking-widest mb-2">Question</p>
          <p className="font-heading italic text-white text-xl md:text-2xl leading-snug">
            "{decryptedQuestion}"
          </p>
        </div>
      )}

      {/* ── Secret input form ── */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 bg-red-950/40 border-l-4 border-red-500 rounded-sm text-xs font-semibold text-red-300">
            {errorMsg}
          </div>
        )}

        {/* Secret input — template-specific */}
        <div className="glass-card rounded-sm p-5 border border-white/5 bg-[#0C0C0C]/50 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-white uppercase tracking-widest">Your Answer</p>
            <span className="text-[9px] text-white/30 font-bold uppercase tracking-wider">{room.template}</span>
          </div>

          {/* Person template — no checkboxes, just show required fields */}
          {room.template === 'Person' && (
            <div className="space-y-3">
              {personConfig?.formatHint && (
                <p className="text-xs text-white/40">
                  Format: <span className="text-[#D4AF37]">{personConfig.formatHint}</span>
                </p>
              )}
              {showFirstName && (
                <div>
                  <label className="block text-[10px] text-white/40 mb-1.5 uppercase tracking-wider">First name</label>
                  <input
                    type="text"
                    value={firstName}
                    disabled={inputDisabled}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. John"
                    autoComplete="off"
                    className="w-full h-11 px-4 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm text-white placeholder-white/30 rounded-sm transition-all disabled:opacity-20"
                  />
                </div>
              )}
              {showLastName && (
                <div>
                  <label className="block text-[10px] text-white/40 mb-1.5 uppercase tracking-wider">Last name</label>
                  <input
                    type="text"
                    value={lastName}
                    disabled={inputDisabled}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="e.g. Smith"
                    autoComplete="off"
                    className="w-full h-11 px-4 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm text-white placeholder-white/30 rounded-sm transition-all disabled:opacity-20"
                  />
                </div>
              )}
            </div>
          )}

          {room.template === 'Number' && (
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={secret}
              disabled={inputDisabled}
              onChange={(e) => setSecret(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="e.g. 125000"
              autoComplete="off"
              className="w-full h-11 px-4 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm font-mono text-white placeholder-white/30 rounded-sm transition-all disabled:opacity-20"
            />
          )}

          {room.template === 'Email' && (
            <div className="space-y-1">
              <input
                type="email"
                value={secret}
                disabled={inputDisabled}
                onChange={(e) => {
                  const v = e.target.value.toLowerCase().trim();
                  setSecret(v);
                  setEmailValid(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
                }}
                placeholder="e.g. john@company.com"
                autoComplete="off"
                className={`w-full h-11 px-4 bg-[#080808]/90 border ${secret && emailValid ? 'border-green-600' : 'border-zinc-600'} hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm text-white placeholder-white/30 rounded-sm transition-all disabled:opacity-20`}
              />
              {secret && !emailValid && (
                <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Invalid email</p>
              )}
              {secret && emailValid && (
                <p className="text-xs text-green-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Valid</p>
              )}
            </div>
          )}

          {room.template === 'Date' && (
            <input
              type="date"
              value={secret}
              disabled={inputDisabled}
              onChange={(e) => setSecret(e.target.value)}
              className="w-full h-11 px-4 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm text-white rounded-sm transition-all disabled:opacity-20"
            />
          )}

          {(room.template === 'Project' || room.template === 'Custom') && (
            <input
              type="text"
              value={secret}
              disabled={inputDisabled}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Enter your answer…"
              autoComplete="off"
              className="w-full h-11 px-4 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm text-white placeholder-white/30 rounded-sm transition-all disabled:opacity-20"
            />
          )}

          {/* Normalization preview */}
          {normalizedPreview && (
            <div className="flex items-center gap-2 pt-1 border-t border-white/5">
              <Eye className="w-3.5 h-3.5 text-white/20 shrink-0" />
              <span className="text-[10px] text-white/30 uppercase tracking-wider">Will compare as:</span>
              <span className="font-mono text-[10px] text-[#D4AF37]/70 break-all">{normalizedPreview}</span>
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || inputDisabled}
          className="w-full h-12 bg-[#D4AF37] border border-[#D4AF37] text-black hover:bg-transparent hover:text-[#D4AF37] font-heading font-semibold text-sm tracking-wider uppercase rounded-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:bg-white/10 disabled:text-white/30"
        >
          {loading ? 'Encrypting…' : 'Check for Match'}
          {!loading && <Sparkles className="w-4 h-4" />}
        </button>

        {/* Display name — demoted to bottom */}
        <div className="flex items-center gap-3 pt-1">
          <div className="flex-grow">
            <label className="block text-[10px] text-white/30 uppercase tracking-widest mb-1.5">
              Your display name <span className="normal-case text-white/20">(shown only on match)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={joinerName}
                disabled={inputDisabled}
                onChange={(e) => setJoinerName(e.target.value)}
                placeholder="Display name…"
                className="w-full h-9 pl-3 pr-9 bg-[#080808]/60 border border-zinc-700 hover:border-zinc-500 focus:border-[#D4AF37]/60 focus:ring-1 focus:ring-[#D4AF37]/30 outline-none text-xs text-white/70 placeholder-white/20 rounded-sm transition-all disabled:opacity-20"
              />
              <button
                type="button"
                disabled={inputDisabled}
                onClick={() => setJoinerName(generateNickname())}
                title="Random name"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/20 hover:text-[#D4AF37]/60 transition-colors cursor-pointer disabled:opacity-20"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
