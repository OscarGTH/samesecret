/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  User, 
  Layers, 
  Calendar, 
  Mail, 
  Hash, 
  Settings, 
  ChevronDown, 
  Eye, 
  Info, 
  Unlock, 
  Lightbulb, 
  Sparkles,
  UserCheck,
  RefreshCw
} from 'lucide-react';
import { MatchTemplate, RoomConfig } from '../types';
import { normalizeSecret, sha256, encryptAES, generateNickname } from '../utils/crypto';
import { generatePrivateExponent, hashToGroupElement, modPow, P } from '../utils/smp';
import { api } from '../lib/api';

interface CreateCheckProps {
  onRoomCreated: (roomId: string, accessCode: string, question: string, template: MatchTemplate, roomKeyHex?: string) => void;
}

export default function CreateCheck({ onRoomCreated }: CreateCheckProps) {
  const [creatorName, setCreatorName] = useState(() => generateNickname());
  const [question, setQuestion] = useState('');
  const [template, setTemplate] = useState<MatchTemplate>('Custom');
  const [secret, setSecret] = useState('');
  
  // Advanced options configuration
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(true);
  const [selfDestruct, setSelfDestruct] = useState(true);
  
  // Normalized Preview value
  const [normalizedPreview, setNormalizedPreview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Automatic live normalization updates
  useEffect(() => {
    if (!secret.trim()) {
      setNormalizedPreview('');
    } else {
      const result = normalizeSecret(secret, template, caseSensitive, ignoreWhitespace);
      setNormalizedPreview(result);
    }
  }, [secret, template, caseSensitive, ignoreWhitespace]);

  // Adjust advanced defaults based on template selections
  const handleSelectTemplate = (selTemplate: MatchTemplate) => {
    setTemplate(selTemplate);
    if (selTemplate === 'Email') {
      setCaseSensitive(false);
      setIgnoreWhitespace(true);
    } else if (selTemplate === 'Number') {
      setCaseSensitive(false);
      setIgnoreWhitespace(true);
    } else if (selTemplate === 'Person') {
      setCaseSensitive(false);
      setIgnoreWhitespace(false);
    } else if (selTemplate === 'Date') {
      setCaseSensitive(false);
      setIgnoreWhitespace(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!creatorName.trim()) {
      setErrorMsg('Please specify your Display Name for authentication.');
      return;
    }
    if (!question.trim()) {
      setErrorMsg('Please state what comparison point you are checking.');
      return;
    }
    if (!secret.trim()) {
      setErrorMsg('Please provide your secret value to initiate comparing.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Generate a 32-byte random key for client-side encryption of the question
      const roomKeyBytes = window.crypto.getRandomValues(new Uint8Array(32));
      const roomKeyHex = Array.from(roomKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');

      // Encrypt the question client-side before transport
      const encryptedQuestion = await encryptAES(question.trim(), roomKeyBytes);
      
      // Encrypt the creator name client-side before transport
      const encryptedCreatorName = await encryptAES(creatorName.trim() || 'Creator', roomKeyBytes);

      // 1. Core client-side SMP generation before transport!
      const finalNormalizedVal = normalizeSecret(secret, template, caseSensitive, ignoreWhitespace);
      const H_A = await hashToGroupElement(finalNormalizedVal);
      const privateKeyA = generatePrivateExponent();
      const creatorSmpA = modPow(H_A, privateKeyA, P);

      // 2. Dispatch to server (sending encryptedQuestion and encryptedCreatorName)
      const payload = {
        question: encryptedQuestion,
        template,
        creatorName: encryptedCreatorName,
        creatorSmpA: creatorSmpA.toString(),
        caseSensitive,
        ignoreWhitespace,
        selfDestruct,
      };

      const res = await fetch(api('/api/rooms'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errObj = await res.json();
        throw new Error(errObj.error || 'Server rejected check creation');
      }

      const data = await res.json();

      // Save Alice's private key a locally associated with the created roomId
      sessionStorage.setItem(`smp_private_key_${data.id}`, privateKeyA.toString());
      
      // Save the room key hex locally for persistence
      sessionStorage.setItem(`smp_room_key_${data.id}`, roomKeyHex);

      // Save list of active session rooms
      try {
        const activeRoomsJson = sessionStorage.getItem('secret_matcher_active_session_rooms');
        const activeRooms = activeRoomsJson ? JSON.parse(activeRoomsJson) : [];
        if (!activeRooms.some((r: any) => r.roomId === data.id)) {
          activeRooms.push({
            roomId: data.id,
            accessCode: data.accessCode,
            question: question.trim(), // Keep cleartext question in active session history
            template,
            createdAt: Date.now(),
            role: 'creator',
            creatorName: creatorName.trim(),
          });
          sessionStorage.setItem('secret_matcher_active_session_rooms', JSON.stringify(activeRooms));
        }
      } catch (sessionErr) {
        console.error('Session storage error:', sessionErr);
      }

      // Pass cleartext question to UI state, but with roomKeyHex for link sharing
      onRoomCreated(data.id, data.accessCode, question.trim(), template, roomKeyHex);
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected transport issue occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto text-left space-y-8 animate-fade-in">
      {/* Title block */}
      <div className="text-center md:text-left">
        <h2 className="font-heading italic text-white text-2xl md:text-3.5xl mb-2">
          Create Secret Check
        </h2>
        <p className="font-sans text-xs text-white/50 max-w-2xl">
          Start a secure room to compare sensitive information without revealing it unless there is a perfect match.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Form Panel */}
        <div className="lg:col-span-8 space-y-6">
          {errorMsg && (
            <div className="p-4 bg-red-950/40 border-l-4 border-red-500 rounded-sm text-xs font-semibold text-red-300">
              {errorMsg}
            </div>
          )}

          <div className="glass-card rounded-sm p-6 relative overflow-hidden space-y-6 border border-white/5">
            <div className="absolute inset-0 pointer-events-none custom-pattern"></div>
            
            <div className="relative z-10 space-y-5">
              {/* Creator Name input */}
              <div>
                <label className="block text-[10px] font-bold text-[#D4AF37] uppercase tracking-widest mb-2" htmlFor="creatorName">
                  Your Display Name (Revealed only upon dynamic match)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D4AF37]/60">
                    <UserCheck className="w-4 h-4" />
                  </span>
                  <input 
                    type="text" 
                    id="creatorName"
                    value={creatorName}
                    onChange={(e) => setCreatorName(e.target.value)}
                    placeholder="e.g. 'John Smith'"
                    className="w-full h-11 pl-10 pr-12 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm font-sans text-white placeholder-white/30 transition-all rounded-sm shadow-md"
                  />
                  <button
                    type="button"
                    onClick={() => setCreatorName(generateNickname())}
                    title="Generate random nickname"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#D4AF37]/65 hover:text-[#D4AF37] hover:scale-115 active:scale-95 p-1 rounded-sm hover:bg-white/5 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4 animate-spin-hover" />
                  </button>
                </div>
              </div>

              {/* What are checking? */}
              <div>
                <label className="block text-[10px] font-bold text-[#D4AF37] uppercase tracking-widest mb-2" htmlFor="question">
                  What are you checking?
                </label>
                <input 
                  type="text" 
                  id="question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g., 'Who is our upcoming choice for project manager?'"
                  className="w-full h-11 px-4 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm font-sans text-white placeholder-white/30 transition-all rounded-sm shadow-md"
                />
              </div>

              {/* Normalization Match Logic Templates */}
              <div>
                <label className="block text-[10px] font-bold text-[#D4AF37] uppercase tracking-widest mb-3">
                  Match Logic Template
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 select-none w-full">
                  {/* Template Chip Person */}
                  <button
                    type="button"
                    onClick={() => handleSelectTemplate('Person')}
                    className={`flex flex-col items-center justify-center py-3 px-2 rounded-sm border text-center active:scale-95 transition-all outline-none cursor-pointer ${
                      template === 'Person' 
                        ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]' 
                        : 'border-white/5 bg-white/[0.01] hover:border-white/20 text-white/50'
                    }`}
                  >
                    <User className="w-4 h-4 mb-2 shrink-0" />
                    <span className="text-[10px] sm:text-xs font-bold text-center w-full leading-tight">Person Name</span>
                  </button>

                  {/* Template Chip Project */}
                  <button
                    type="button"
                    onClick={() => handleSelectTemplate('Project')}
                    className={`flex flex-col items-center justify-center py-3 px-2 rounded-sm border text-center active:scale-95 transition-all outline-none cursor-pointer ${
                      template === 'Project' 
                        ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]' 
                        : 'border-white/5 bg-white/[0.01] hover:border-white/20 text-white/50'
                    }`}
                  >
                    <Layers className="w-4 h-4 mb-2 shrink-0" />
                    <span className="text-[10px] sm:text-xs font-bold text-center w-full leading-tight">Project Name</span>
                  </button>

                  {/* Template Chip Date */}
                  <button
                    type="button"
                    onClick={() => handleSelectTemplate('Date')}
                    className={`flex flex-col items-center justify-center py-3 px-2 rounded-sm border text-center active:scale-95 transition-all outline-none cursor-pointer ${
                      template === 'Date' 
                        ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]' 
                        : 'border-white/5 bg-white/[0.01] hover:border-white/20 text-white/50'
                    }`}
                  >
                    <Calendar className="w-4 h-4 mb-2 shrink-0" />
                    <span className="text-[10px] sm:text-xs font-bold text-center w-full leading-tight">Date</span>
                  </button>

                  {/* Template Chip Email */}
                  <button
                    type="button"
                    onClick={() => handleSelectTemplate('Email')}
                    className={`flex flex-col items-center justify-center py-3 px-2 rounded-sm border text-center active:scale-95 transition-all outline-none cursor-pointer ${
                      template === 'Email' 
                        ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]' 
                        : 'border-white/5 bg-white/[0.01] hover:border-white/20 text-white/50'
                    }`}
                  >
                    <Mail className="w-4 h-4 mb-2 shrink-0" />
                    <span className="text-[10px] sm:text-xs font-bold text-center w-full leading-tight">Email ID</span>
                  </button>

                  {/* Template Chip Number */}
                  <button
                    type="button"
                    onClick={() => handleSelectTemplate('Number')}
                    className={`flex flex-col items-center justify-center py-3 px-2 rounded-sm border text-center active:scale-95 transition-all outline-none cursor-pointer ${
                      template === 'Number' 
                        ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]' 
                        : 'border-white/5 bg-white/[0.01] hover:border-white/20 text-white/50'
                    }`}
                  >
                    <Hash className="w-4 h-4 mb-2 shrink-0" />
                    <span className="text-[10px] sm:text-xs font-bold text-center w-full leading-tight">Number</span>
                  </button>

                  {/* Template Chip Custom */}
                  <button
                    type="button"
                    onClick={() => handleSelectTemplate('Custom')}
                    className={`flex flex-col items-center justify-center py-3 px-2 rounded-sm border text-center active:scale-95 transition-all outline-none cursor-pointer ${
                      template === 'Custom' 
                        ? 'border-[#D4AF37] bg-[#D4AF37]/20 text-[#D4AF37]' 
                        : 'border-white/5 bg-white/[0.01] hover:border-white/20 text-white/50'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 mb-2 text-[#D4AF37] shrink-0" />
                    <span className="text-[10px] sm:text-xs font-bold text-center w-full leading-tight">Custom Mode</span>
                  </button>
                </div>
              </div>

              {/* Secret Value field */}
              <div>
                <label className="block text-[10px] font-bold text-[#D4AF37] uppercase tracking-widest mb-2" htmlFor="secret">
                  Your Secret Value
                </label>
                <textarea 
                  id="secret"
                  rows={3}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="Enter the exact answer for secure comparison..."
                  className="w-full p-4 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm font-sans font-mono text-white placeholder-white/30 transition-all rounded-sm shadow-md animate-pulse-soft"
                ></textarea>
              </div>
            </div>
          </div>

          {/* Advanced collapsible details block */}
          <details className="group glass-card rounded-sm shadow-xl overflow-hidden select-none border border-white/5">
            <summary className="flex items-center justify-between p-5 cursor-pointer list-none focus:outline-none">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-white/50 group-hover:rotate-45 transition-transform duration-300" />
                <span className="font-heading italic text-white text-sm">Advanced Secret Parameters</span>
              </div>
              <ChevronDown className="w-5 h-5 text-white/30 group-open:rotate-180 transition-transform" />
            </summary>

            <div className="p-5 pt-0 space-y-4 border-t border-white/5 text-white/80">
              {/* Row 1: Case Sensitivity */}
              <div className="flex items-center justify-between pt-4">
                <div>
                  <p className="font-sans text-xs font-bold text-white/80">Case Sensitive Comparison</p>
                  <p className="text-[10px] text-white/40">If active, letters like 'A' and 'a' will be matched separately.</p>
                </div>
                <input 
                  type="checkbox" 
                  checked={caseSensitive}
                  onChange={(e) => setCaseSensitive(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-black/40 text-[#D4AF37] focus:ring-[#D4AF37]"
                />
              </div>

              {/* Row 2: Whitespace Ignores */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-sans text-xs font-bold text-white/80">Ignore spaces and tabs</p>
                  <p className="text-[10px] text-white/40">Ignore whitespace modifications, spaces, and formatting tabs so typos do not break the comparison.</p>
                </div>
                <input 
                  type="checkbox" 
                  checked={ignoreWhitespace}
                  onChange={(e) => setIgnoreWhitespace(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-black/40 text-[#D4AF37] focus:ring-[#D4AF37]"
                />
              </div>

              {/* Row 3: Self-destruct triggers */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-sans text-xs font-bold text-white/80">Automated Self-Destruct</p>
                  <p className="text-[10px] text-white/40">Session keys are fully purged 10 seconds post-match, or 24 hours after room creation if inactive.</p>
                </div>
                <input 
                  type="checkbox" 
                  checked={selfDestruct}
                  onChange={(e) => setSelfDestruct(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-black/40 text-[#D4AF37] focus:ring-[#D4AF37]"
                />
              </div>
            </div>
          </details>
        </div>

        {/* Right Info & CTA Panel */}
        <div className="lg:col-span-4 space-y-6">
          {/* Normalization Preview section */}
          <div className="glass-card rounded-sm p-5 border border-white/5 flex flex-col justify-between">
            <div>
              <h3 className="font-heading italic text-xs text-[#D4AF37] mb-3 uppercase tracking-widest flex items-center gap-1.5">
                <Eye className="w-4 h-4" />
                <span>Normalization Tracker</span>
              </h3>
              
              <div className="bg-black/40 border border-white/5 rounded-sm p-4 min-h-[100px] flex flex-col justify-center">
                <span className="text-[9px] text-white/30 font-bold block mb-1">WILL BE COMPARED AS:</span>
                <p className={`font-mono text-xs break-all leading-relaxed ${normalizedPreview ? 'text-[#D4AF37] font-semibold' : 'text-white/20 italic'}`}>
                  {normalizedPreview || 'Waiting for active typing inputs...'}
                </p>
              </div>
            </div>

            <div className="mt-4 p-3 bg-[#D4AF37]/5 rounded-sm border border-[#D4AF37]/20 flex gap-2.5 text-xs text-white/80">
              <Info className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
              <p className="text-[10px] text-white/50 leading-relaxed">
                Your secret is used client-side to compute a blinded modular exponent. No plain secret or raw hash is ever sent to or processed by the server.
              </p>
            </div>
          </div>

          {/* Create Button triggers */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 bg-[#D4AF37] border border-[#D4AF37] hover:bg-transparent hover:text-[#D4AF37] text-black disabled:bg-white/10 disabled:text-white/30 rounded-sm font-heading font-semibold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Unlock className="w-4 h-4" />
            <span>{isSubmitting ? 'Securing Check...' : 'Create Check'}</span>
          </button>

          {/* Tips block */}
          <div className="p-5 rounded-sm border border-white/10 border-dashed text-white/80">
            <h4 className="font-heading italic text-xs uppercase tracking-wider text-[#D4AF37] mb-2 flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>Discreet Match Tips</span>
            </h4>
            <p className="font-sans text-xs text-white/40 leading-relaxed">
              Choosing target templates like "Email ID" or "Person name" automatically normalizes common white-spaces, special chars and accents. This avoids match failure due to trivial format errors.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
