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
  RefreshCw,
  CheckCircle,
  AlertCircle
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

  // Person template structured fields
  const [personFields, setPersonFields] = useState({
    includeFirstName: true,
    includeLastName: true,
    firstName: '',
    lastName: ''
  });

  // Email validation
  const [emailValid, setEmailValid] = useState(true);

  // Advanced options configuration
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(true);
  const [selfDestruct, setSelfDestruct] = useState(true);

  // Normalized Preview value
  const [normalizedPreview, setNormalizedPreview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Helper: Get person name preview
  function getPersonNamePreview() {
    const parts = [];
    if (personFields.includeFirstName && personFields.firstName) {
      parts.push(personFields.firstName);
    }
    if (personFields.includeLastName && personFields.lastName) {
      parts.push(personFields.lastName);
    }
    return parts.join(' ') || '';
  }

  // Helper: Get format hint for joiner
  function getPersonFormatHint() {
    const parts = [];
    if (personFields.includeFirstName) parts.push('first name');
    if (personFields.includeLastName) parts.push('last name');
    return parts.join(' + ');
  }

  // Helper: Validate email
  function validateEmail(email: string) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    setEmailValid(regex.test(email));
  }

  // Helper: Get final secret value based on template
  function getSecretValue() {
    if (template === 'Person') {
      return getPersonNamePreview();
    }
    return secret;
  }

  // Automatic live normalization updates
  useEffect(() => {
    const secretValue = getSecretValue();
    if (!secretValue.trim()) {
      setNormalizedPreview('');
    } else {
      const result = normalizeSecret(secretValue, template, caseSensitive, ignoreWhitespace);
      setNormalizedPreview(result);
    }
  }, [secret, personFields, template, caseSensitive, ignoreWhitespace]);

  // Adjust advanced defaults based on template selections
  const handleSelectTemplate = (selTemplate: MatchTemplate) => {
    setTemplate(selTemplate);
    setSecret(''); // Clear secret when changing template
    
    // Reset person fields
    setPersonFields({
      includeFirstName: true,
      includeLastName: true,
      firstName: '',
      lastName: ''
    });

    // Set defaults based on template
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

    const finalSecret = getSecretValue();
    if (!finalSecret.trim()) {
      setErrorMsg('Please provide your secret value to initiate comparing.');
      return;
    }

    // Email validation
    if (template === 'Email' && !emailValid) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    // Person validation
    if (template === 'Person' && !personFields.includeFirstName && !personFields.includeLastName) {
      setErrorMsg('Please select at least one name field (first name or last name).');
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
      const finalNormalizedVal = normalizeSecret(finalSecret, template, caseSensitive, ignoreWhitespace);
      const H_A = await hashToGroupElement(finalNormalizedVal);
      const privateKeyA = generatePrivateExponent();
      const creatorSmpA = modPow(H_A, privateKeyA, P);

      // 2. Prepare template configuration
      const templateConfig: any = {};
      if (template === 'Person') {
        templateConfig.personFields = {
          includeFirstName: personFields.includeFirstName,
          includeLastName: personFields.includeLastName,
          formatHint: getPersonFormatHint()
        };
      }

      // 3. Dispatch to server (sending encryptedQuestion and encryptedCreatorName)
      const payload = {
        question: encryptedQuestion,
        template,
        creatorName: encryptedCreatorName,
        creatorSmpA: creatorSmpA.toString(),
        templateConfig, // NEW: Send template configuration
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
        throw new Error(errObj.error || 'Failed to create room');
      }

      const data = await res.json();

      // Store the private key in sessionStorage for later finalization
      sessionStorage.setItem(`smp_private_key_${data.id}`, privateKeyA.toString());

      // Store room key for decryption
      sessionStorage.setItem(`smp_room_key_${data.id}`, roomKeyHex);

      // Store in active session list
      try {
        const activeRooms = JSON.parse(sessionStorage.getItem('secret_matcher_active_session_rooms') || '[]');
        activeRooms.push({
          roomId: data.id,
          accessCode: data.accessCode,
          question: question.trim(),
          role: 'creator',
          template,
          createdAt: Date.now()
        });
        sessionStorage.setItem('secret_matcher_active_session_rooms', JSON.stringify(activeRooms));
      } catch (e) {
        console.error('Failed to store active room:', e);
      }

      onRoomCreated(data.id, data.accessCode, question.trim(), template, roomKeyHex);
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fade-in my-2 md:my-6">
      {/* Left Form Panel */}
      <div className="lg:col-span-8 space-y-6">
        {errorMsg && (
          <div className="p-4 bg-red-950/40 border-l-4 border-red-500 rounded-sm text-xs font-semibold text-red-300">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
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

              {/* Template-specific input fields */}
              <div>
                {/* Person Name Template - Structured */}
                {template === 'Person' && (
                  <div className="space-y-4 p-4 bg-white/[0.02] rounded-sm border border-white/10">
                    <p className="text-xs text-white/50 mb-2">
                      Select which name parts to include:
                    </p>

                    <div className="space-y-3">
                      {/* First Name */}
                      <div>
                        <label className="flex items-center gap-2 text-xs text-white/70 mb-2">
                          <input
                            type="checkbox"
                            checked={personFields.includeFirstName}
                            onChange={(e) => setPersonFields({
                              ...personFields,
                              includeFirstName: e.target.checked
                            })}
                            className="rounded border-white/20 bg-black/40 text-[#D4AF37] focus:ring-[#D4AF37]"
                          />
                          Include First Name
                        </label>

                        {personFields.includeFirstName && (
                          <input
                            type="text"
                            value={personFields.firstName}
                            onChange={(e) => setPersonFields({
                              ...personFields,
                              firstName: e.target.value
                            })}
                            placeholder="e.g., John"
                            className="w-full h-10 px-3 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm text-white placeholder-white/30 rounded-sm transition-all"
                          />
                        )}
                      </div>

                      {/* Last Name */}
                      <div>
                        <label className="flex items-center gap-2 text-xs text-white/70 mb-2">
                          <input
                            type="checkbox"
                            checked={personFields.includeLastName}
                            onChange={(e) => setPersonFields({
                              ...personFields,
                              includeLastName: e.target.checked
                            })}
                            className="rounded border-white/20 bg-black/40 text-[#D4AF37] focus:ring-[#D4AF37]"
                          />
                          Include Last Name
                        </label>

                        {personFields.includeLastName && (
                          <input
                            type="text"
                            value={personFields.lastName}
                            onChange={(e) => setPersonFields({
                              ...personFields,
                              lastName: e.target.value
                            })}
                            placeholder="e.g., Smith"
                            className="w-full h-10 px-3 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm text-white placeholder-white/30 rounded-sm transition-all"
                          />
                        )}
                      </div>
                    </div>

                    {/* Preview */}
                    {(personFields.firstName || personFields.lastName) && (
                      <div className="pt-3 border-t border-white/10">
                        <p className="text-[10px] text-white/40 mb-1">Preview:</p>
                        <p className="text-sm font-mono text-[#D4AF37]">
                          {getPersonNamePreview() || '(empty)'}
                        </p>
                        <p className="text-[10px] text-white/30 mt-1">
                          Other person will see format hint: "{getPersonFormatHint()}"
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Number Template - Numeric Only */}
                {template === 'Number' && (
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-[#D4AF37] uppercase tracking-widest mb-2">
                      Enter Number
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={secret}
                      onChange={(e) => {
                        // Only allow digits
                        const value = e.target.value.replace(/[^0-9]/g, '');
                        setSecret(value);
                      }}
                      placeholder="e.g., 125000"
                      className="w-full h-11 px-4 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm font-mono text-white placeholder-white/30 transition-all rounded-sm shadow-md"
                    />
                    <p className="text-[10px] text-white/40">
                      ℹ️ Only numbers allowed (no commas, spaces, or symbols)
                    </p>
                  </div>
                )}

                {/* Email Template - Validation */}
                {template === 'Email' && (
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-[#D4AF37] uppercase tracking-widest mb-2">
                      Enter Email Address
                    </label>
                    <input
                      type="email"
                      value={secret}
                      onChange={(e) => {
                        const email = e.target.value.toLowerCase().trim();
                        setSecret(email);
                        validateEmail(email);
                      }}
                      placeholder="e.g., john.smith@company.com"
                      className={`w-full h-11 px-4 bg-[#080808]/90 border ${
                        secret && emailValid ? 'border-green-600' : 'border-zinc-600'
                      } hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm text-white placeholder-white/30 transition-all rounded-sm shadow-md`}
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

                {/* Date Template - Date Picker */}
                {template === 'Date' && (
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-[#D4AF37] uppercase tracking-widest mb-2">
                      Select Date
                    </label>
                    <input
                      type="date"
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      className="w-full h-11 px-4 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm text-white rounded-sm shadow-md transition-all"
                    />
                    <p className="text-[10px] text-white/40">
                      ℹ️ Format: YYYY-MM-DD (standardized automatically)
                    </p>
                  </div>
                )}

                {/* Project & Custom Templates - Free Text */}
                {(template === 'Project' || template === 'Custom') && (
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-[#D4AF37] uppercase tracking-widest mb-2" htmlFor="secret">
                      Your Secret Value
                    </label>
                    <textarea
                      id="secret"
                      rows={3}
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      placeholder="Enter the exact answer for secure comparison..."
                      className="w-full p-4 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm font-sans font-mono text-white placeholder-white/30 transition-all rounded-sm shadow-md"
                    ></textarea>
                  </div>
                )}
              </div>

              {/* Normalized Preview */}
              {normalizedPreview && (
                <div className="glass-card rounded-sm p-4 bg-black/40 border-dashed border border-white/10">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-1.5 select-none">
                      <Eye className="w-4 h-4 text-[#D4AF37]/60" />
                      <span>WILL BE COMPARED AS:</span>
                    </span>
                    <div className="font-mono text-xs font-bold tracking-widest break-all text-[#D4AF37]">
                      {normalizedPreview}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Advanced collapsible details block */}
          <details className="group glass-card rounded-sm shadow-xl overflow-hidden select-none border border-white/5 mt-6">
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
                  <p className="text-[10px] text-white/40">Removes all white-space characters from the secret before matching.</p>
                </div>
                <input
                  type="checkbox"
                  checked={ignoreWhitespace}
                  onChange={(e) => setIgnoreWhitespace(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-black/40 text-[#D4AF37] focus:ring-[#D4AF37]"
                />
              </div>

              {/* Row 3: Self Destruct */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-sans text-xs font-bold text-white/80">Ephemeral Room Mode</p>
                  <p className="text-[10px] text-white/40">Room self-destructs 10 seconds after match attempt or within 24 hours.</p>
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

          {/* Privacy info */}
          <div className="mt-6 flex items-start gap-3 p-4 bg-[#D4AF37]/5 rounded-sm border border-[#D4AF37]/10 text-left">
            <div className="w-8 h-8 rounded-full bg-[#D4AF37]/15 flex items-center justify-center text-[#D4AF37] shrink-0 mt-0.5">
              <Info className="w-4 h-4 text-[#D4AF37] shrink-0" />
            </div>
            <p className="text-[10px] text-white/50 leading-relaxed">
              Your secret is used client-side to compute a blinded modular exponent. No plain secret or raw hash is ever sent to or processed by the server.
            </p>
          </div>

          {/* Create Button triggers */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 bg-[#D4AF37] border border-[#D4AF37] hover:bg-transparent hover:text-[#D4AF37] text-black disabled:bg-white/10 disabled:text-white/30 rounded-sm font-heading font-semibold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all cursor-pointer mt-6"
          >
            <Unlock className="w-4 h-4" />
            <span>{isSubmitting ? 'Securing Check...' : 'Create Check'}</span>
          </button>

          {/* Tips block */}
          <div className="p-5 rounded-sm border border-white/10 border-dashed text-white/80 mt-6">
            <h4 className="font-heading italic text-xs uppercase tracking-wider text-[#D4AF37] mb-2 flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>Discreet Match Tips</span>
            </h4>
            <p className="font-sans text-xs text-white/40 leading-relaxed">
              Choosing target templates like "Email ID" or "Person name" automatically normalizes common white-spaces, special chars and accents. This avoids match failure due to trivial format errors.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}