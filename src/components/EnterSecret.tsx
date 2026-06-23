/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  MessagesSquare,
  Fingerprint,
  Eye,
  Lock,
  Sparkles,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  KeyRound,
  RefreshCw
} from 'lucide-react';
import { RoomState } from '../types';
import { normalizeSecret, sha256, decryptAES, encryptAES, generateNickname } from '../utils/crypto';
import { generatePrivateExponent, hashToGroupElement, modPow, P } from '../utils/smp';
import { api } from '../lib/api';
import { Loader2 } from 'lucide-react';

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

  // Person template structured fields
  const personConfig = room.templateConfig?.personFields;
  const [personFields, setPersonFields] = useState({
    includeFirstName: personConfig?.includeFirstName ?? true,
    includeLastName: personConfig?.includeLastName ?? true,
    firstName: '',
    lastName: '',
  });

  // Email validation
  const [emailValid, setEmailValid] = useState(true);
  const [isWaitingForFinalize, setIsWaitingForFinalize] = useState(false);

  function getPersonNamePreview() {
    const parts = [];
    if (personFields.includeFirstName && personFields.firstName) parts.push(personFields.firstName);
    if (personFields.includeLastName && personFields.lastName) parts.push(personFields.lastName);
    return parts.join(' ') || '';
  }

  function validateEmail(email: string) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    setEmailValid(regex.test(email));
  }

  function getSecretValue() {
    if (room.template === 'Person') return getPersonNamePreview();
    return secret;
  }

  // States for client-side decryption of the question
  const [decryptedQuestion, setDecryptedQuestion] = useState<string>('');
  const [decryptionError, setDecryptionError] = useState<boolean>(false);
  const [manualKey, setManualKey] = useState<string>('');
  const [isDecrypting, setIsDecrypting] = useState<boolean>(true);

  // Try to decrypt on mount
  useEffect(() => {
    let active = true;

    async function attemptDecryption() {
      const hexRegex = /^[0-9a-fA-F]+$/;
      // If the question is not hex encoded or is too short to be IV + ciphertext, treat as raw question
      if (!hexRegex.test(room.question) || room.question.length < 24) {
        if (active) {
          setDecryptedQuestion(room.question);
          setIsDecrypting(false);
        }
        return;
      }

      // Try finding the key from stores
      let keyHex = sessionStorage.getItem(`smp_room_key_${room.id}`) || '';
      if (!keyHex) {
        keyHex = sessionStorage.getItem('smp_current_url_key') || '';
      }
      if (!keyHex && window.location.hash) {
        const hashVal = window.location.hash.substring(1);
        if (hashVal.length === 64 && hexRegex.test(hashVal)) {
          keyHex = hashVal;
        }
      }

      if (!keyHex) {
        if (active) {
          setDecryptionError(true);
          setIsDecrypting(false);
        }
        return;
      }

      try {
        const keyBytes = new Uint8Array(keyHex.length / 2);
        for (let i = 0; i < keyBytes.length; i++) {
          keyBytes[i] = parseInt(keyHex.substring(i * 2, i * 2 + 2), 16);
        }

        const cleartext = await decryptAES(room.question, keyBytes);

        // Save successfully verified key
        sessionStorage.setItem(`smp_room_key_${room.id}`, keyHex);

        if (active) {
          setDecryptedQuestion(cleartext);
          setDecryptionError(false);
          setIsDecrypting(false);
        }
      } catch (err) {
        if (active) {
          setDecryptionError(true);
          setIsDecrypting(false);
        }
      }
    }

    attemptDecryption();
    return () => {
      active = false;
    };
  }, [room.id, room.question]);

  // Handle manual key input
  const handleManualKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!manualKey.trim()) return;

    let keyHex = manualKey.trim();
    if (keyHex.includes('#')) {
      keyHex = keyHex.split('#')[1];
    }

    const hexRegex = /^[0-9a-fA-F]{64}$/;
    if (!hexRegex.test(keyHex)) {
      setErrorMsg('Invalid key. Key must be a 64-character hexadecimal string.');
      return;
    }

    try {
      const keyBytes = new Uint8Array(keyHex.length / 2);
      for (let i = 0; i < keyBytes.length; i++) {
        keyBytes[i] = parseInt(keyHex.substring(i * 2, i * 2 + 2), 16);
      }

      const cleartext = await decryptAES(room.question, keyBytes);

      // Save successfully entered key
      sessionStorage.setItem(`smp_room_key_${room.id}`, keyHex);
      setDecryptedQuestion(cleartext);
      setDecryptionError(false);
    } catch (err) {
      setErrorMsg('Decryption failed. The key is incorrect or corrupted.');
    }
  };

  // Load reconnection state if already submitted in active session
  useEffect(() => {
    try {
      const isSubmitted = sessionStorage.getItem(`smp_joiner_submitted_${room.id}`) === 'true';
      if (isSubmitted) {
        const savedJoinerName = sessionStorage.getItem(`smp_joiner_name_${room.id}`);
        if (savedJoinerName) {
          setJoinerName(savedJoinerName);
        }
        setIsWaitingForFinalize(true);
      }
    } catch (e) {
      console.error(e);
    }
  }, [room.id]);

  // Watch for text updates and dynamically display normalized result
  useEffect(() => {
    const secretValue = getSecretValue();
    if (!secretValue.trim()) {
      setNormalizedPreview('');
    } else {
      const result = normalizeSecret(secretValue, room.template, room.caseSensitive, room.ignoreWhitespace);
      setNormalizedPreview(result);
    }
  }, [secret, personFields, room]);

  // Poll for handshake outcome
  useEffect(() => {
    if (!isWaitingForFinalize) return;

    let active = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(api(`/api/rooms/${room.id}/status`));
        if (!res.ok) {
          throw new Error('Lost connection to pairing session');
        }
        const data = await res.json();
        if (!active) return;

        if (data.status === 'matched') {
          clearInterval(interval);
          let decryptedCreatorName = data.creatorName || room.creatorName || 'Creator';
          const savedKey = sessionStorage.getItem(`smp_room_key_${room.id}`);
          if (savedKey) {
            try {
              const hexRegex = /^[0-9a-fA-F]+$/;
              if (hexRegex.test(decryptedCreatorName) && decryptedCreatorName.length >= 24) {
                const keyBytes = new Uint8Array(savedKey.length / 2);
                for (let i = 0; i < keyBytes.length; i++) {
                  keyBytes[i] = parseInt(savedKey.substring(i * 2, i * 2 + 2), 16);
                }
                const { decryptAES } = await import('../utils/crypto');
                decryptedCreatorName = await decryptAES(decryptedCreatorName, keyBytes);
              }
            } catch (errDecrypt) {
              console.error('Failed to decrypt creator name on matched:', errDecrypt);
            }
          }
          onJoinComplete('matched', decryptedCreatorName);
        } else if (data.status === 'no_match') {
          clearInterval(interval);
          onJoinComplete('no_match');
        } else if (data.status === 'cancelled') {
          clearInterval(interval);
          onJoinComplete('cancelled');
        }
      } catch (e) {
        console.error('Join status polling error:', e);
      }
    }, 1500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isWaitingForFinalize, room, onJoinComplete]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!joinerName.trim()) {
      setErrorMsg('Please specify your Display Name.');
      return;
    }

    const finalSecret = getSecretValue();
    if (!finalSecret.trim()) {
      setErrorMsg('Please provide your secret value to check.');
      return;
    }

    if (room.template === 'Email' && !emailValid) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (room.template === 'Person' && !personFields.includeFirstName && !personFields.includeLastName) {
      setErrorMsg('Please include at least one name field (first name or last name).');
      return;
    }

    setLoading(true);

    try {
      // 1. Perform local cryptography block before transport
      const finalNormalizedVal = normalizeSecret(
        finalSecret,
        room.template,
        room.caseSensitive,
        room.ignoreWhitespace
      );
      
      const keyHex = sessionStorage.getItem(`smp_room_key_${room.id}`) || sessionStorage.getItem('smp_current_url_key') || '';
      let encryptedJoinerName = joinerName.trim();
      if (keyHex) {
        try {
          const keyBytes = new Uint8Array(keyHex.length / 2);
          for (let i = 0; i < keyBytes.length; i++) {
            keyBytes[i] = parseInt(keyHex.substring(i * 2, i * 2 + 2), 16);
          }
          const { encryptAES } = await import('../utils/crypto');
          encryptedJoinerName = await encryptAES(joinerName.trim() || 'Joiner', keyBytes);
        } catch (e) {
          console.error('Failed to encrypt joinerName:', e);
        }
      }
      
      // Compute Bob's parts under Socialist Millionaire Protocol
      const H_B = await hashToGroupElement(finalNormalizedVal);
      const privateKeyB = generatePrivateExponent();
      const B = modPow(H_B, privateKeyB, P);

      // Alice's blinded public key A is in room.creatorSmpA
      if (!room.creatorSmpA) {
        throw new Error('Symmetric context is missing. Handshake is impossible.');
      }
      const creatorA = BigInt(room.creatorSmpA);
      const C_B = modPow(creatorA, privateKeyB, P);

      const res = await fetch(api(`/api/rooms/${room.id}/join`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: encryptedJoinerName,
          joinerSmpB: B.toString(),
          joinerSmpCB: C_B.toString(),
        }),
      });

      if (!res.ok) {
        const errObj = await res.json();
        throw new Error(errObj.error || 'Server rejected match check.');
      }

      // 3. Save info into active session rooms list
      try {
        const activeRoomsJson = sessionStorage.getItem('secret_matcher_active_session_rooms');
        const activeRooms = activeRoomsJson ? JSON.parse(activeRoomsJson) : [];
        if (!activeRooms.some((r: any) => r.roomId === room.id)) {
          let clearCreatorName = room.creatorName || 'Creator';
          if (keyHex && clearCreatorName) {
            try {
              const hexRegex = /^[0-9a-fA-F]+$/;
              if (hexRegex.test(clearCreatorName) && clearCreatorName.length >= 24) {
                const keyBytes = new Uint8Array(keyHex.length / 2);
                for (let i = 0; i < keyBytes.length; i++) {
                  keyBytes[i] = parseInt(keyHex.substring(i * 2, i * 2 + 2), 16);
                }
                const { decryptAES } = await import('../utils/crypto');
                clearCreatorName = await decryptAES(clearCreatorName, keyBytes);
              }
            } catch (errDec) {
              console.error('Failed to decrypt creator name inside session save:', errDec);
            }
          }

          activeRooms.push({
            roomId: room.id,
            accessCode: room.accessCode,
            question: decryptedQuestion || room.question,
            template: room.template,
            createdAt: Date.now(),
            role: 'joiner',
            creatorName: clearCreatorName,
            joinerName: joinerName.trim(),
          });
          sessionStorage.setItem('secret_matcher_active_session_rooms', JSON.stringify(activeRooms));
        }
        sessionStorage.setItem(`smp_joiner_submitted_${room.id}`, 'true');
        sessionStorage.setItem(`smp_joiner_name_${room.id}`, joinerName.trim());
      } catch (sessionErr) {
        console.error('Session record error:', sessionErr);
      }

      // Enter handshaking wait status while creator is finalising
      setIsWaitingForFinalize(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification could not complete successfully.');
      setLoading(false);
    }
  };

  if (isWaitingForFinalize) {
    return (
      <div className="max-w-md mx-auto items-center justify-center space-y-4 animate-fade-in text-center my-2 md:my-12">
        <div className="glass-card p-8 rounded-sm shadow-2xl relative text-left border border-white/5 bg-[#0C0C0C]/50">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 shadow-inner">
              <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
            </div>
            
            <div className="space-y-2">
              <h1 className="font-heading italic text-white text-xl md:text-2xl animate-pulse">
                Encrypted Handshake...
              </h1>
              <p className="font-sans text-xs text-white/50 leading-relaxed max-w-[280px] mx-auto">
                Performing Zero-Knowledge Socialist Millionaire comparison over double-blinded prime exponents.
              </p>
            </div>

            <div className="p-4 bg-black/40 border border-white/5 rounded-sm flex flex-col gap-2.5 text-left font-mono text-[10px] text-white/40 leading-relaxed">
              <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                <span>MATHEMATICAL MODULUS P:</span>
                <span className="text-[#D4AF37]">RFC 2409 (1024-bit)</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                <span>YOUR BLINDED VALUE B:</span>
                <span className="text-green-400">Transmitted & Secured</span>
              </div>
              <div className="flex justify-between items-center">
                <span>HANDSHAKE HANDOFF:</span>
                <span className="animate-pulse text-[#D4AF37] font-semibold text-right">Verification in Progress...</span>
              </div>
            </div>

            <p className="font-sans text-xs text-white/60 leading-relaxed">
              Please wait while the room creator's browser retrieves the secure payload and carries out the final cryptographic validation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fade-in text-left my-2 md:my-6">
      {/* Creator's Question Card holds either decrypting, error/action form, or clear text */}
      {isDecrypting ? (
        <section className="glass-card rounded-sm p-6 relative overflow-hidden border-l-4 border-l-[#D4AF37] shadow-sm border-white/5 bg-[#0C0C0C]/50 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" />
          <span className="font-sans text-xs text-white/50">Decrypting comparison question client-side...</span>
        </section>
      ) : decryptionError ? (
        <section className="glass-card rounded-sm p-6 relative overflow-hidden border-l-4 border-l-red-500 shadow-sm border-white/5 bg-[#0C0C0C]/50">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-red-400">
              <Lock className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest select-none">
                Decryption Key Required
              </span>
            </div>
            <p className="font-sans text-xs text-white/60 leading-relaxed">
              This comparison room is end-to-end encrypted. The server only sees encrypted gibberish. Enter the 64-character Room Key or paste the full invitation link to unlock this question:
            </p>
            <form onSubmit={handleManualKeySubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="Paste key or invitation link (e.g., same.chat/j/XYZ#key)"
                value={manualKey}
                onChange={(e) => setManualKey(e.target.value)}
                className="flex-grow h-10 px-3 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 outline-none text-xs font-mono text-white placeholder-white/20 transition-all rounded-sm shadow-md"
              />
              <button
                type="submit"
                className="h-10 px-4 bg-[#D4AF37] border border-[#D4AF37] text-black hover:bg-transparent hover:text-[#D4AF37] font-heading font-semibold text-xs tracking-wider uppercase rounded-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Decrypt</span>
              </button>
            </form>
          </div>
        </section>
      ) : (
        <section className="glass-card rounded-sm p-6 relative overflow-hidden border-l-4 border-l-[#D4AF37] shadow-sm border-white/5 bg-[#0C0C0C]/50">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-widest flex items-center gap-1.5 select-none">
              <MessagesSquare className="w-4 h-4" />
              <span>Creator's Comparison Question</span>
            </span>
            <h1 className="font-heading italic text-white text-lg leading-snug">
              "{decryptedQuestion || 'Loading Comparison...'}"
            </h1>
          </div>
        </section>
      )}

      {/* Input section form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {errorMsg && (
          <div className="p-4 bg-red-950/40 border-l-4 border-red-500 rounded-sm text-xs font-semibold text-red-300">
            {errorMsg}
          </div>
        )}

        {/* Enter name */}
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-[#D4AF37] uppercase tracking-widest" htmlFor="joinerName">
            Your Display Name (Revealed only upon dynamic match)
          </label>
          <div className="relative">
            <input 
              type="text" 
              id="joinerName"
              value={joinerName}
              disabled={decryptionError || isDecrypting}
              onChange={(e) => setJoinerName(e.target.value)}
              placeholder="e.g. 'John Smith'"
              className="w-full h-11 pl-4 pr-12 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm font-sans text-white placeholder-white/30 transition-all rounded-sm shadow-md disabled:opacity-20"
            />
            <button
              type="button"
              disabled={decryptionError || isDecrypting}
              onClick={() => setJoinerName(generateNickname())}
              title="Generate random nickname"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#D4AF37]/65 hover:text-[#D4AF37] hover:scale-115 active:scale-95 p-1 rounded-sm hover:bg-white/5 transition-all cursor-pointer disabled:opacity-20"
            >
              <RefreshCw className="w-4 h-4 animate-spin-hover" />
            </button>
          </div>
        </div>

        {/* Enter secret — template-specific inputs */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[#D4AF37]">
            <label className="block text-[10px] font-bold uppercase tracking-widest">
              Your Secret
            </label>
            <span className="text-[9px] text-white/40 font-bold whitespace-nowrap uppercase tracking-wider">
              Template: {room.template}
            </span>
          </div>

          {/* Person Name Template */}
          {room.template === 'Person' && (
            <div className="space-y-3 p-4 bg-white/[0.02] rounded-sm border border-white/10">
              {personConfig?.formatHint && (
                <p className="text-xs text-white/50">
                  Creator's format: <span className="text-[#D4AF37] font-semibold">{personConfig.formatHint}</span>
                </p>
              )}
              {!personConfig && (
                <p className="text-xs text-white/50">Select which name parts to include:</p>
              )}

              {/* First Name */}
              <div>
                <label className="flex items-center gap-2 text-xs text-white/70 mb-2">
                  <input
                    type="checkbox"
                    checked={personFields.includeFirstName}
                    disabled={personConfig != null}
                    onChange={(e) => setPersonFields({ ...personFields, includeFirstName: e.target.checked })}
                    className="rounded border-white/20 bg-black/40 text-[#D4AF37] focus:ring-[#D4AF37] disabled:opacity-50"
                  />
                  Include First Name
                </label>
                {personFields.includeFirstName && (
                  <input
                    type="text"
                    value={personFields.firstName}
                    disabled={decryptionError || isDecrypting}
                    onChange={(e) => setPersonFields({ ...personFields, firstName: e.target.value })}
                    placeholder="e.g., John"
                    autoComplete="off"
                    className="w-full h-10 px-3 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm text-white placeholder-white/30 rounded-sm transition-all disabled:opacity-20"
                  />
                )}
              </div>

              {/* Last Name */}
              <div>
                <label className="flex items-center gap-2 text-xs text-white/70 mb-2">
                  <input
                    type="checkbox"
                    checked={personFields.includeLastName}
                    disabled={personConfig != null}
                    onChange={(e) => setPersonFields({ ...personFields, includeLastName: e.target.checked })}
                    className="rounded border-white/20 bg-black/40 text-[#D4AF37] focus:ring-[#D4AF37] disabled:opacity-50"
                  />
                  Include Last Name
                </label>
                {personFields.includeLastName && (
                  <input
                    type="text"
                    value={personFields.lastName}
                    disabled={decryptionError || isDecrypting}
                    onChange={(e) => setPersonFields({ ...personFields, lastName: e.target.value })}
                    placeholder="e.g., Smith"
                    autoComplete="off"
                    className="w-full h-10 px-3 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm text-white placeholder-white/30 rounded-sm transition-all disabled:opacity-20"
                  />
                )}
              </div>

              {(personFields.firstName || personFields.lastName) && (
                <div className="pt-3 border-t border-white/10">
                  <p className="text-[10px] text-white/40 mb-1">Preview:</p>
                  <p className="text-sm font-mono text-[#D4AF37]">{getPersonNamePreview() || '(empty)'}</p>
                </div>
              )}
            </div>
          )}

          {/* Number Template */}
          {room.template === 'Number' && (
            <div className="space-y-1">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={secret}
                disabled={decryptionError || isDecrypting}
                onChange={(e) => setSecret(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="e.g., 125000"
                autoComplete="off"
                className="w-full h-11 px-4 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm font-mono text-white placeholder-white/30 transition-all rounded-sm shadow-md disabled:opacity-20"
              />
              <p className="text-[10px] text-white/40">Only numbers allowed (no commas, spaces, or symbols)</p>
            </div>
          )}

          {/* Email Template */}
          {room.template === 'Email' && (
            <div className="space-y-1">
              <input
                type="email"
                value={secret}
                disabled={decryptionError || isDecrypting}
                onChange={(e) => {
                  const email = e.target.value.toLowerCase().trim();
                  setSecret(email);
                  validateEmail(email);
                }}
                placeholder="e.g., john.smith@company.com"
                autoComplete="off"
                className={`w-full h-11 px-4 bg-[#080808]/90 border ${
                  secret && emailValid ? 'border-green-600' : 'border-zinc-600'
                } hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm text-white placeholder-white/30 transition-all rounded-sm shadow-md disabled:opacity-20`}
              />
              {secret && !emailValid && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Please enter a valid email address
                </p>
              )}
              {secret && emailValid && (
                <p className="text-xs text-green-400 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Valid email format
                </p>
              )}
            </div>
          )}

          {/* Date Template */}
          {room.template === 'Date' && (
            <div className="space-y-1">
              <input
                type="date"
                value={secret}
                disabled={decryptionError || isDecrypting}
                onChange={(e) => setSecret(e.target.value)}
                className="w-full h-11 px-4 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm text-white rounded-sm shadow-md transition-all disabled:opacity-20"
              />
              <p className="text-[10px] text-white/40">Format: YYYY-MM-DD (standardized automatically)</p>
            </div>
          )}

          {/* Project & Custom Templates */}
          {(room.template === 'Project' || room.template === 'Custom') && (
            <div className="relative group">
              <input
                type="text"
                id="secret"
                value={secret}
                disabled={decryptionError || isDecrypting}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Enter the name/answer here..."
                autoComplete="off"
                className="w-full h-11 pl-4 pr-10 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm font-sans text-white placeholder-white/30 transition-all rounded-sm shadow-md disabled:opacity-20"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center text-[#D4AF37]/50 group-focus-within:opacity-100 transition-opacity">
                <Fingerprint className="w-4 h-4" />
              </div>
            </div>
          )}

          <p className="text-[10px] text-white/30 font-medium italic pl-1">
            Case: {room.caseSensitive ? 'Sensitive' : 'Insensitive'}, White-space: {room.ignoreWhitespace ? 'Ignored' : 'Strict'}
          </p>
        </div>

        {/* Normalization Preview card matches screen */}
        <div className="glass-card rounded-sm p-4 bg-black/40 border-dashed border border-white/10">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-1.5 select-none">
              <Eye className="w-4 h-4 text-[#D4AF37]/60" />
              <span>WILL BE COMPARED AS:</span>
            </span>
            <div className={`font-mono text-xs font-bold tracking-widest break-all ${normalizedPreview ? 'text-[#D4AF37]' : 'text-white/25 italic'}`}>
              {normalizedPreview || '—'}
            </div>
          </div>
        </div>

        {/* Security reassurance */}
        <div className="flex items-start gap-3 p-4 bg-[#D4AF37]/5 rounded-sm border border-[#D4AF37]/10 text-left">
          <div className="w-8 h-8 rounded-full bg-[#D4AF37]/15 flex items-center justify-center text-[#D4AF37] shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <p className="font-sans text-[11px] text-white/50 leading-relaxed">
            Your secret is processed locally and <span className="font-bold text-[#D4AF37]">never sent to our servers</span>. Matching occurs securely using the Zero-Knowledge Socialist Millionaire Protocol.
          </p>
        </div>

        {/* Primary match check CTA */}
        <button
          type="submit"
          disabled={loading || decryptionError || isDecrypting}
          className="w-full h-12 bg-[#D4AF37] border border-[#D4AF37] text-black hover:bg-transparent hover:text-[#D4AF37] hover:border-[#D4AF37]/40 font-heading font-semibold text-xs tracking-wider uppercase rounded-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:bg-white/10 disabled:text-white/30"
        >
          {loading ? 'Encrypting Local Crypts...' : 'Check for Match'}
          <Sparkles className="w-4 h-4 text-black animate-pulse" />
        </button>
      </form>
    </div>
  );
}
