/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  User,
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
  AlertCircle,
  List,
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Check
} from 'lucide-react';
import { MatchTemplate, RoomConfig } from '../types';
import { normalizeSecret, encryptAES, generateNickname } from '../utils/crypto';
import { smpStep1 } from '../utils/smp';
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

  // Multiple choice options
  const [multiChoiceOptions, setMultiChoiceOptions] = useState<string[]>(['', '']);
  const [multiChoiceSelected, setMultiChoiceSelected] = useState('');

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

  // Wizard step
  const [step, setStep] = useState(1);
  const [stepErrors, setStepErrors] = useState('');

  function validateStep(currentStep: number): boolean {
    setStepErrors('');
    if (currentStep === 1) {
      if (!creatorName.trim()) { setStepErrors('Please enter your display name.'); return false; }
      return true;
    }
    if (currentStep === 2) {
      if (!question.trim()) { setStepErrors('Please enter the question you are checking.'); return false; }
      return true;
    }
    if (currentStep === 3) {
      if (template === 'Person') {
        if (!personFields.includeFirstName && !personFields.includeLastName) {
          setStepErrors('Please select at least one name field (first name or last name).'); return false;
        }
        if (personFields.includeFirstName && !personFields.firstName.trim()) {
          setStepErrors('Please enter the first name.'); return false;
        }
        if (personFields.includeLastName && !personFields.lastName.trim()) {
          setStepErrors('Please enter the last name.'); return false;
        }
        return true;
      }
      if (template === 'Email') {
        if (!secret.trim()) { setStepErrors('Please enter an email address.'); return false; }
        if (!emailValid) { setStepErrors('Please enter a valid email address.'); return false; }
        return true;
      }
      if (template === 'MultipleChoice') {
        const validOptions = multiChoiceOptions.map(o => o.trim()).filter(Boolean);
        if (validOptions.length < 2) { setStepErrors('Please add at least two options.'); return false; }
        if (!multiChoiceSelected) { setStepErrors('Please select which option is the correct match.'); return false; }
        return true;
      }
      if (!getSecretValue().trim()) { setStepErrors('Please enter your secret value.'); return false; }
      return true;
    }
    return true;
  }

  function handleNext() {
    if (validateStep(step)) {
      window.scrollTo(0, 0);
      setStep(s => s + 1);
    }
  }

  function handleBack() {
    setStepErrors('');
    window.scrollTo(0, 0);
    setStep(s => s - 1);
  }

  // Derived: whether all required fields are filled to enable the submit button
  const canSubmit = !isSubmitting &&
    creatorName.trim().length > 0 &&
    question.trim().length > 0 &&
    (() => {
      if (template === 'Person') {
        if (!personFields.includeFirstName && !personFields.includeLastName) return false;
        if (personFields.includeFirstName && !personFields.firstName.trim()) return false;
        if (personFields.includeLastName && !personFields.lastName.trim()) return false;
        return true;
      }
      if (template === 'Email') {
        return secret.trim().length > 0 && emailValid;
      }
      if (template === 'MultipleChoice') {
        const validOptions = multiChoiceOptions.map(o => o.trim()).filter(Boolean);
        return validOptions.length >= 2 && multiChoiceSelected.length > 0;
      }
      return getSecretValue().trim().length > 0;
    })();

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
    if (template === 'MultipleChoice') {
      return multiChoiceSelected;
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
  }, [secret, personFields, multiChoiceSelected, template, caseSensitive, ignoreWhitespace]);

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

    // Reset multiple choice
    setMultiChoiceOptions(['', '']);
    setMultiChoiceSelected('');

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
    } else if (selTemplate === 'MultipleChoice') {
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

    // Multiple choice validation
    if (template === 'MultipleChoice') {
      const validOptions = multiChoiceOptions.map(o => o.trim()).filter(Boolean);
      if (validOptions.length < 2) {
        setErrorMsg('Please add at least two options for the multiple choice question.');
        return;
      }
      if (!multiChoiceSelected) {
        setErrorMsg('Please select which option is the correct secret to match.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Generate room key for encrypting question
      const roomKeyBytes = window.crypto.getRandomValues(new Uint8Array(32));
      const roomKeyHex = Array.from(roomKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      
      const encryptedQuestion = await encryptAES(question.trim(), roomKeyBytes);
      const encryptedCreatorName = await encryptAES(creatorName.trim() || 'Creator', roomKeyBytes);
      
      // SMP Step 1: Generate initial public values
      const finalNormalizedVal = normalizeSecret(finalSecret, template, caseSensitive, ignoreWhitespace);
      const step1 = smpStep1();
      
      // Store private values locally (NEVER send to server)
      sessionStorage.setItem(`smp_a2_${Date.now()}`, step1.a2.toString());
      sessionStorage.setItem(`smp_a3_${Date.now()}`, step1.a3.toString());
      sessionStorage.setItem(`smp_secret_${Date.now()}`, finalNormalizedVal);
      
      // 2. Prepare template configuration
      const templateConfig: any = {};
      if (template === 'Person') {
        templateConfig.personFields = {
          includeFirstName: personFields.includeFirstName,
          includeLastName: personFields.includeLastName,
          formatHint: getPersonFormatHint()
        };
      } else if (template === 'MultipleChoice') {
        const validOptions = multiChoiceOptions.map(o => o.trim()).filter(Boolean);
        templateConfig.multipleChoiceOptions = await encryptAES(JSON.stringify(validOptions), roomKeyBytes);
        templateConfig.multipleChoiceOptionCount = validOptions.length;
      }

      const payload = {
        question: encryptedQuestion,
        template,
        creatorName: encryptedCreatorName,
        creatorG2a: step1.g2a.toString(),  // PUBLIC value
        creatorG3a: step1.g3a.toString(),  // PUBLIC value
        templateConfig,
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
      
      // Store metadata
      sessionStorage.setItem(`smp_room_key_${data.id}`, roomKeyHex);
      sessionStorage.setItem(`smp_room_${data.id}`, JSON.stringify({
        a2: step1.a2.toString(),
        a3: step1.a3.toString(),
        secret: finalNormalizedVal,
      }));
      
      onRoomCreated(data.id, data.accessCode, question.trim(), template, roomKeyHex);
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
      setIsSubmitting(false);
    }
  };

  const steps = [
    { num: 1, label: 'Name' },
    { num: 2, label: 'Question' },
    { num: 3, label: 'Answer' },
    { num: 4, label: 'Review' },
  ];

  function getStepSummary() {
    const items: { label: string; value: string }[] = [];
    if (creatorName.trim()) items.push({ label: 'Your Name', value: creatorName.trim() });
    if (question.trim()) items.push({ label: 'Question', value: `"${question.trim()}"` });
    const secretVal = getSecretValue();
    if (secretVal.trim()) {
      const templateLabel = template === 'MultipleChoice' ? `Multiple Choice (${multiChoiceOptions.filter(o => o.trim()).length} options)` : template;
      items.push({ label: `Template / Answer`, value: `${templateLabel}: ${secretVal.trim()}` });
    }
    return items;
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in my-2 md:my-6">
      {/* Step indicator */}
      <div className="flex items-center justify-between mb-8 px-1">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                step === s.num
                  ? 'bg-[#D4AF37] text-black shadow-[0_0_10px_rgba(212,175,55,0.4)]'
                  : step > s.num
                  ? 'bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30'
                  : 'bg-white/5 text-white/30 border border-white/10'
              }`}>
                {step > s.num ? <Check className="w-4 h-4" /> : s.num}
              </div>
              <span className={`text-[10px] mt-1.5 font-bold uppercase tracking-wider whitespace-nowrap ${
                step === s.num ? 'text-[#D4AF37]' : step > s.num ? 'text-[#D4AF37]/60' : 'text-white/30'
              }`}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-2 mt-[-1.2rem] ${
                step > s.num ? 'bg-[#D4AF37]/40' : 'bg-white/10'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Summary of completed steps (hidden on step 4 — it's shown in detail below) */}
      {step > 1 && step < 4 && getStepSummary().slice(0, step - 1).length > 0 && (
        <div className="mb-6 p-3 bg-white/[0.02] rounded-sm border border-white/5 space-y-1">
          {getStepSummary().slice(0, step - 1).map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <Check className="w-3 h-3 text-[#D4AF37] shrink-0" />
              <span className="text-white/40">{item.label}:</span>
              <span className="text-white/70 truncate">{item.value}</span>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="glass-card rounded-sm p-6 relative overflow-hidden border border-white/5">
          <div className="absolute inset-0 pointer-events-none custom-pattern"></div>

          <div className="relative z-10 space-y-5">
            {(stepErrors || errorMsg) && (
              <div className="p-3 bg-red-950/40 border-l-4 border-red-500 rounded-sm text-xs font-semibold text-red-300">
                {stepErrors || errorMsg}
              </div>
            )}

            {/* Step 1: Display Name */}
            {step === 1 && (
              <div>
                <label className="block text-xs font-bold text-[#D4AF37] uppercase tracking-widest mb-2" htmlFor="creatorName">
                  Your Display Name <span className="normal-case text-white/30 font-normal">(shown only on match)</span>
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
                    className="w-full h-12 pl-10 pr-12 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm font-sans text-white placeholder-white/30 transition-all rounded-sm shadow-md"
                    autoFocus
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
                <p className="text-xs text-white/40 mt-2">This name is encrypted and only revealed if both parties match.</p>
              </div>
            )}

            {/* Step 2: Question */}
            {step === 2 && (
              <div>
                <label className="block text-xs font-bold text-[#D4AF37] uppercase tracking-widest mb-2" htmlFor="question">
                  What are you checking?
                </label>
                <input
                  type="text"
                  id="question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g., 'Who is our upcoming choice for project manager?'"
                  className="w-full h-12 px-4 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm font-sans text-white placeholder-white/30 transition-all rounded-sm shadow-md"
                  autoFocus
                />
                <p className="text-xs text-white/40 mt-2">The other person will see this question. It will be encrypted until they have the decryption key.</p>
              </div>
            )}

            {/* Step 3: Template + Answer */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-[#D4AF37] uppercase tracking-widest mb-3">
                    Match Logic Template
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 select-none w-full">
                    <button type="button" onClick={() => handleSelectTemplate('Person')} className={`flex flex-col items-center justify-center py-3 px-2 rounded-sm border text-center active:scale-95 transition-all outline-none cursor-pointer ${template === 'Person' ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]' : 'border-white/5 bg-white/[0.01] hover:border-white/20 text-white/50'}`}>
                      <User className="w-4 h-4 mb-2 shrink-0" /><span className="text-[10px] sm:text-xs font-bold text-center w-full leading-tight">Person Name</span>
                    </button>
                    <button type="button" onClick={() => handleSelectTemplate('Date')} className={`flex flex-col items-center justify-center py-3 px-2 rounded-sm border text-center active:scale-95 transition-all outline-none cursor-pointer ${template === 'Date' ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]' : 'border-white/5 bg-white/[0.01] hover:border-white/20 text-white/50'}`}>
                      <Calendar className="w-4 h-4 mb-2 shrink-0" /><span className="text-[10px] sm:text-xs font-bold text-center w-full leading-tight">Date</span>
                    </button>
                    <button type="button" onClick={() => handleSelectTemplate('Email')} className={`flex flex-col items-center justify-center py-3 px-2 rounded-sm border text-center active:scale-95 transition-all outline-none cursor-pointer ${template === 'Email' ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]' : 'border-white/5 bg-white/[0.01] hover:border-white/20 text-white/50'}`}>
                      <Mail className="w-4 h-4 mb-2 shrink-0" /><span className="text-[10px] sm:text-xs font-bold text-center w-full leading-tight">Email ID</span>
                    </button>
                    <button type="button" onClick={() => handleSelectTemplate('Number')} className={`flex flex-col items-center justify-center py-3 px-2 rounded-sm border text-center active:scale-95 transition-all outline-none cursor-pointer ${template === 'Number' ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]' : 'border-white/5 bg-white/[0.01] hover:border-white/20 text-white/50'}`}>
                      <Hash className="w-4 h-4 mb-2 shrink-0" /><span className="text-[10px] sm:text-xs font-bold text-center w-full leading-tight">Number</span>
                    </button>
                    <button type="button" onClick={() => handleSelectTemplate('MultipleChoice')} className={`flex flex-col items-center justify-center py-3 px-2 rounded-sm border text-center active:scale-95 transition-all outline-none cursor-pointer ${template === 'MultipleChoice' ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]' : 'border-white/5 bg-white/[0.01] hover:border-white/20 text-white/50'}`}>
                      <List className="w-4 h-4 mb-2 shrink-0" /><span className="text-[10px] sm:text-xs font-bold text-center w-full leading-tight">Multiple Choice</span>
                    </button>
                    <button type="button" onClick={() => handleSelectTemplate('Custom')} className={`flex flex-col items-center justify-center py-3 px-2 rounded-sm border text-center active:scale-95 transition-all outline-none cursor-pointer ${template === 'Custom' ? 'border-[#D4AF37] bg-[#D4AF37]/20 text-[#D4AF37]' : 'border-white/5 bg-white/[0.01] hover:border-white/20 text-white/50'}`}>
                      <Sparkles className="w-4 h-4 mb-2 text-[#D4AF37] shrink-0" /><span className="text-[10px] sm:text-xs font-bold text-center w-full leading-tight">Custom Mode</span>
                    </button>
                  </div>
                </div>

                {/* Template-specific input */}
                {template === 'Person' && (
                  <div className="space-y-4 p-4 bg-white/[0.02] rounded-sm border border-white/10">
                    <p className="text-xs text-white/50 mb-2">Select which name parts to include:</p>
                    <div className="space-y-3">
                      <div>
                        <label className="flex items-center gap-2 text-xs text-white/70 mb-2">
                          <input type="checkbox" checked={personFields.includeFirstName} onChange={(e) => setPersonFields({...personFields, includeFirstName: e.target.checked})} className="rounded border-white/20 bg-black/40 text-[#D4AF37] focus:ring-[#D4AF37]" />
                          Include First Name
                        </label>
                        {personFields.includeFirstName && (
                          <input type="text" value={personFields.firstName} onChange={(e) => setPersonFields({...personFields, firstName: e.target.value})} placeholder="e.g., John" className="w-full h-10 px-3 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm text-white placeholder-white/30 rounded-sm transition-all" />
                        )}
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-xs text-white/70 mb-2">
                          <input type="checkbox" checked={personFields.includeLastName} onChange={(e) => setPersonFields({...personFields, includeLastName: e.target.checked})} className="rounded border-white/20 bg-black/40 text-[#D4AF37] focus:ring-[#D4AF37]" />
                          Include Last Name
                        </label>
                        {personFields.includeLastName && (
                          <input type="text" value={personFields.lastName} onChange={(e) => setPersonFields({...personFields, lastName: e.target.value})} placeholder="e.g., Smith" className="w-full h-10 px-3 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm text-white placeholder-white/30 rounded-sm transition-all" />
                        )}
                      </div>
                    </div>
                    {(personFields.firstName || personFields.lastName) && (
                      <div className="pt-3 border-t border-white/10">
                        <p className="text-xs text-white/40 mb-1">Preview:</p>
                        <p className="text-sm font-mono text-[#D4AF37]">{getPersonNamePreview() || '(empty)'}</p>
                        <p className="text-xs text-white/30 mt-1">Other person will see format hint: "{getPersonFormatHint()}"</p>
                      </div>
                    )}
                  </div>
                )}

                {template === 'Number' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-[#D4AF37] uppercase tracking-widest mb-2">Enter Number</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={secret} onChange={(e) => setSecret(e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g., 125000" className="w-full h-11 px-4 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm font-mono text-white placeholder-white/30 transition-all rounded-sm shadow-md" />
                    <p className="text-xs text-white/40">ℹ️ Only numbers allowed (no commas, spaces, or symbols)</p>
                  </div>
                )}

                {template === 'Email' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-[#D4AF37] uppercase tracking-widest mb-2">Enter Email Address</label>
                    <input type="email" value={secret} onChange={(e) => { const email = e.target.value.toLowerCase().trim(); setSecret(email); validateEmail(email); }} placeholder="e.g., john.smith@company.com" className={`w-full h-11 px-4 bg-[#080808]/90 border ${secret && emailValid ? 'border-green-600' : 'border-zinc-600'} hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm text-white placeholder-white/30 transition-all rounded-sm shadow-md`} />
                    {secret && !emailValid && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Please enter a valid email address</p>}
                    {secret && emailValid && <p className="text-xs text-green-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Valid email format</p>}
                  </div>
                )}

                {template === 'Date' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-[#D4AF37] uppercase tracking-widest mb-2">Select Date</label>
                    <input type="date" value={secret} onChange={(e) => setSecret(e.target.value)} className="w-full h-11 px-4 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm text-white rounded-sm shadow-md transition-all" />
                    <p className="text-xs text-white/40">ℹ️ Format: YYYY-MM-DD (standardized automatically)</p>
                  </div>
                )}

                {template === 'MultipleChoice' && (
                  <div className="space-y-4 p-4 bg-white/[0.02] rounded-sm border border-white/10">
                    <p className="text-xs text-white/50 mb-2">Define the answer options below. The other person will select from these.</p>
                    <div className="space-y-2">
                      {multiChoiceOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input type="text" value={opt} onChange={(e) => { const updated = [...multiChoiceOptions]; updated[idx] = e.target.value; setMultiChoiceOptions(updated); }} placeholder={`Option ${idx + 1}`} className="flex-1 h-10 px-3 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm text-white placeholder-white/30 rounded-sm transition-all" />
                          {multiChoiceOptions.length > 2 && (
                            <button type="button" onClick={() => { const updated = multiChoiceOptions.filter((_, i) => i !== idx); setMultiChoiceOptions(updated); if (multiChoiceSelected === opt) setMultiChoiceSelected(''); }} className="text-red-400 hover:text-red-300 p-1.5 rounded-sm hover:bg-red-950/40 transition-colors cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => setMultiChoiceOptions([...multiChoiceOptions, ''])} className="flex items-center gap-1.5 text-xs text-[#D4AF37]/70 hover:text-[#D4AF37] transition-colors cursor-pointer"><Plus className="w-3.5 h-3.5" /> Add option</button>
                    {multiChoiceOptions.filter(o => o.trim()).length >= 2 && (
                      <div className="pt-3 border-t border-white/10 space-y-2">
                        <p className="text-xs font-bold text-[#D4AF37] uppercase tracking-widest">Your Selection</p>
                        <p className="text-xs text-white/40 -mt-1">Select the correct answer that both parties must match.</p>
                        {(() => {
                          const validOptions = multiChoiceOptions.filter(o => o.trim());
                          const useGrid = validOptions.length <= 6;
                          return (
                            <div className={useGrid ? 'grid grid-cols-2 sm:grid-cols-3 gap-2' : 'space-y-1.5'}>
                              {validOptions.map((opt, idx) => (
                                <label key={idx} className={`block p-3 rounded-sm border cursor-pointer transition-all text-center ${multiChoiceSelected === opt.trim() ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.15)]' : 'border-white/10 bg-white/[0.02] text-white/60 hover:border-white/30 hover:bg-white/[0.04]'} ${useGrid ? '' : 'flex items-center gap-3'}`}>
                                  <input type="radio" name="multiChoiceSecret" checked={multiChoiceSelected === opt.trim()} onChange={() => setMultiChoiceSelected(opt.trim())} className={`${useGrid ? 'sr-only' : 'text-[#D4AF37] focus:ring-[#D4AF37] border-white/20 bg-black/40'}`} />
                                  <span className={`text-sm font-medium ${useGrid ? 'block py-1' : ''}`}>{opt.trim()}</span>
                                </label>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {template === 'Custom' && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-[#D4AF37] uppercase tracking-widest mb-2" htmlFor="secret">Your Secret Value</label>
                    <textarea id="secret" rows={3} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Enter the exact answer for secure comparison..." className="w-full p-4 bg-[#080808]/90 border border-zinc-600 hover:border-zinc-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/40 outline-none text-sm font-sans font-mono text-white placeholder-white/30 transition-all rounded-sm shadow-md"></textarea>
                  </div>
                )}

                {/* Normalized Preview on this step */}
                {normalizedPreview && (
                  <div className="glass-card rounded-sm p-4 bg-black/40 border-dashed border border-white/10">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-1.5 select-none">
                        <Eye className="w-4 h-4 text-[#D4AF37]/60" />
                        <span>WILL BE COMPARED AS:</span>
                      </span>
                      <div className="font-mono text-xs font-bold tracking-widest break-all text-[#D4AF37]">{normalizedPreview}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Review & Secure */}
            {step === 4 && (
              <div className="space-y-5">
                <p className="text-xs text-white/50">Review your check before securing it.</p>

                <div className="space-y-3">
                  {getStepSummary().map((item, i) => (
                    <div key={i} className="flex flex-col p-3 bg-white/[0.02] rounded-sm border border-white/5">
                      <span className="text-[10px] font-bold text-[#D4AF37]/60 uppercase tracking-widest mb-1">{item.label}</span>
                      <span className="text-sm text-white">{item.value}</span>
                    </div>
                  ))}
                </div>

                {/* Normalized Preview */}
                {normalizedPreview && (
                  <div className="glass-card rounded-sm p-4 bg-black/40 border-dashed border border-white/10">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-1.5 select-none">
                        <Eye className="w-4 h-4 text-[#D4AF37]/60" />
                        <span>WILL BE COMPARED AS:</span>
                      </span>
                      <div className="font-mono text-xs font-bold tracking-widest break-all text-[#D4AF37]">{normalizedPreview}</div>
                    </div>
                  </div>
                )}

                {/* Advanced collapsible details block */}
                <details className="group glass-card rounded-sm shadow-xl overflow-hidden select-none border border-white/5">
                  <summary className="flex items-center justify-between p-4 cursor-pointer list-none focus:outline-none">
                    <div className="flex items-center gap-3">
                      <Settings className="w-5 h-5 text-white/50 group-hover:rotate-45 transition-transform duration-300" />
                      <span className="font-heading italic text-white text-sm">Advanced Secret Parameters</span>
                    </div>
                    <ChevronDown className="w-5 h-5 text-white/30 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="p-4 pt-0 space-y-4 border-t border-white/5 text-white/80">
                    <div className="flex items-center justify-between pt-4">
                      <div><p className="font-sans text-xs font-bold text-white/80">Case Sensitive Comparison</p><p className="text-xs text-white/40">If active, letters like 'A' and 'a' will be matched separately.</p></div>
                      <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} className="h-4 w-4 rounded border-white/20 bg-black/40 text-[#D4AF37] focus:ring-[#D4AF37]" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div><p className="font-sans text-xs font-bold text-white/80">Ignore spaces and tabs</p><p className="text-xs text-white/40">Removes all white-space characters from the secret before matching.</p></div>
                      <input type="checkbox" checked={ignoreWhitespace} onChange={(e) => setIgnoreWhitespace(e.target.checked)} className="h-4 w-4 rounded border-white/20 bg-black/40 text-[#D4AF37] focus:ring-[#D4AF37]" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div><p className="font-sans text-xs font-bold text-white/80">Ephemeral Room Mode</p><p className="text-xs text-white/40">Room self-destructs 10 seconds after match attempt or within 24 hours.</p></div>
                      <input type="checkbox" checked={selfDestruct} onChange={(e) => setSelfDestruct(e.target.checked)} className="h-4 w-4 rounded border-white/20 bg-black/40 text-[#D4AF37] focus:ring-[#D4AF37]" />
                    </div>
                  </div>
                </details>

                {/* Privacy info */}
                <div className="flex items-start gap-3 p-4 bg-[#D4AF37]/5 rounded-sm border border-[#D4AF37]/10 text-left">
                  <div className="w-8 h-8 rounded-full bg-[#D4AF37]/15 flex items-center justify-center text-[#D4AF37] shrink-0 mt-0.5">
                    <Info className="w-4 h-4 text-[#D4AF37] shrink-0" />
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed">Your secret is used client-side to compute a blinded modular exponent. No plain secret or raw hash is ever sent to or processed by the server.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Create Room button inside form (step 4 only) */}
        {step === 4 && (
          <div className="flex justify-end mt-6">
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex items-center gap-2 h-12 px-8 bg-[#D4AF37] border border-[#D4AF37] hover:bg-transparent hover:text-[#D4AF37] text-black disabled:bg-white/10 disabled:text-white/30 disabled:cursor-not-allowed rounded-sm font-heading font-semibold text-xs tracking-wider uppercase transition-all cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              <span>{isSubmitting ? 'Securing...' : 'Create Room'}</span>
            </button>
          </div>
        )}

        {/* Tips block (only on step 3) */}
        {step === 3 && (
          <div className="p-5 rounded-sm border border-white/10 border-dashed text-white/80 mt-6">
            <h4 className="font-heading italic text-xs uppercase tracking-wider text-[#D4AF37] mb-2 flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>Discreet Match Tips</span>
            </h4>
            <p className="font-sans text-xs text-white/40 leading-relaxed">
              Choosing target templates like "Email ID" or "Person name" automatically normalizes common white-spaces, special chars and accents. This avoids match failure due to trivial format errors.
            </p>
          </div>
        )}
      </form>

      {/* Navigation buttons (outside form — never triggers submit) */}
      <div className="flex items-center justify-between mt-6">
        <div>
          {step > 1 && (
            <button
              type="button"
              onClick={handleBack}
              disabled={isSubmitting}
              className="flex items-center gap-2 h-11 px-5 rounded-sm border border-white/10 text-white/60 hover:text-white hover:border-white/30 text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-30"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          )}
        </div>

        {step < 4 && (
          <button
            type="button"
            onClick={handleNext}
            className="flex items-center gap-2 h-11 px-6 bg-[#D4AF37] border border-[#D4AF37] text-black hover:bg-transparent hover:text-[#D4AF37] rounded-sm font-heading font-semibold text-xs tracking-wider uppercase transition-all cursor-pointer"
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}