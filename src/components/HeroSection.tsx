/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ShieldCheck, Plus, ScanLine, EyeOff, Fingerprint, Lock, CheckCircle2, Hash, User, Calendar, Mail } from 'lucide-react';

interface HeroSectionProps {
  onAction: (view: 'create' | 'join') => void;
  onRejoinRoom: (roomId: string, role: 'creator' | 'joiner') => void;
}

export default function HeroSection({ onAction, onRejoinRoom }: HeroSectionProps) {
  const [activeSessionRooms, setActiveSessionRooms] = useState<any[]>([]);

  useEffect(() => {
    try {
      const activeRoomsJson = sessionStorage.getItem('secret_matcher_active_session_rooms');
      if (activeRoomsJson) {
        const rooms = JSON.parse(activeRoomsJson);
        // Filter out rooms created or modified more than 10 minutes (600,000 ms) ago
        const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
        const validRooms = rooms.filter((r: any) => r.createdAt && r.createdAt > tenMinutesAgo);
        setActiveSessionRooms(validRooms);
        
        // Update session storage so expired entries are pruned
        if (validRooms.length !== rooms.length) {
          sessionStorage.setItem('secret_matcher_active_session_rooms', JSON.stringify(validRooms));
        }
      }
    } catch (e) {
      console.error('Failed restoring active session list:', e);
    }
  }, []);
  return (
    <section className="space-y-8 md:space-y-16 animate-fade-in hero-gradient">
        {/* Upper Hero Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center pt-3 md:pt-16">
        <div className="lg:col-span-7 flex flex-col gap-6 text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 rounded-sm w-fit">
            <ShieldCheck className="w-4 h-4" />
            <span className="font-sans text-[10px] uppercase tracking-widest font-bold">Zero-Knowledge Protocols Enabled</span>
          </div>

          <h2 className="font-heading italic text-white text-3xl md:text-5xl leading-tight">
            Verify mutual knowledge <span className="text-[#D4AF37] block md:inline">privately.</span>
          </h2>

          <p className="font-sans text-xs md:text-sm text-white/60 leading-relaxed max-w-xl">
            Check if someone knows the same secret without revealing it. Our secure zero-knowledge protocol design ensures that if there's no match, no information is leaked to either party.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            <button 
              onClick={() => onAction('create')}
              className="h-11 px-8 rounded-sm bg-[#D4AF37] border border-[#D4AF37] text-black hover:bg-transparent hover:text-[#D4AF37] hover:border-[#D4AF37]/40 font-semibold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Check</span>
            </button>

            <button 
              onClick={() => onAction('join')}
              className="h-11 px-8 rounded-sm border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black hover:border-[#D4AF37] font-semibold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer bg-transparent"
            >
              <ScanLine className="w-4 h-4" />
              <span>Join Check</span>
            </button>
          </div>

          {activeSessionRooms.length > 0 && (
            <div className="max-w-md bg-[#0C0C0C]/50 border border-white/5 rounded-sm p-4 text-left space-y-3 mt-4">
              <div className="flex items-center gap-1.5 text-[#D4AF37] font-semibold text-xs uppercase tracking-wider border-b border-white/5 pb-2">
                <span>Active This Session</span>
              </div>
              <div className="space-y-2">
                {activeSessionRooms.map((room) => (
                  <div 
                    key={room.roomId}
                    className="flex items-center justify-between p-2 bg-black/40 border border-white/10 rounded-sm hover:border-[#D4AF37]/30 transition-all"
                  >
                    <div className="flex flex-col min-w-0 pr-4">
                      <span className="font-mono text-[9px] text-[#D4AF37] uppercase tracking-wider font-bold">
                        Room {room.accessCode} • {room.role === 'creator' ? 'Created' : 'Joined'}
                      </span>
                      <span className="font-heading italic text-white text-xs truncate max-w-[200px] block">
                        "{room.question}"
                      </span>
                    </div>
                    <button
                      onClick={() => onRejoinRoom(room.roomId, room.role)}
                      className="px-3 py-1 bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 hover:bg-[#D4AF37] hover:text-black rounded-sm text-[10px] uppercase tracking-wider font-bold active:scale-95 transition-all cursor-pointer shrink-0"
                    >
                      Open
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Animated Visual Cluster */}
        <div className="hidden md:flex lg:col-span-5 relative justify-center items-center py-6">
          <div className="relative w-full max-w-[340px] aspect-square rounded-sm glass-card flex items-center justify-center overflow-hidden border border-white/5">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#D4AF37_1px,transparent_1px)] [background-size:16px_16px]"></div>
            
            <div className="relative z-10 flex flex-col items-center gap-4 animate-bounce" style={{ animationDuration: '4s' }}>
              <div className="w-20 h-20 rounded-full bg-[#0C0C0C] flex items-center justify-center shadow-2xl border border-[#D4AF37]/30">
                <ShieldCheck className="w-10 h-10 text-[#D4AF37]" />
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="h-0.5 w-24 bg-[#D4AF37] rounded-full mb-3 opacity-30"></div>
                <div className="px-5 py-1.5 rounded-sm bg-[#D4AF37]/5 border border-[#D4AF37]/20 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                  <span className="font-sans text-[10px] uppercase tracking-widest font-bold text-[#D4AF37]">Encrypted Match</span>
                </div>
              </div>
            </div>

            <div className="absolute -top-10 -right-10 w-36 h-36 bg-[#D4AF37]/5 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-[#D4AF37]/5 rounded-full blur-3xl"></div>
          </div>
        </div>
      </div>

      {/* Example questions */}
      <div className="py-2 md:py-4 text-left">
        <h3 className="font-heading italic text-white text-xl mb-1">
          What people compare
        </h3>
        <p className="text-sm text-white/40 mb-4">
          Both answers stay secret unless they match. Only then does either party find out.
        </p>

        {/* Template type strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          {[
            { type: 'Number', desc: 'Exact values',         icon: <Hash className="w-4 h-4" /> },
            { type: 'Name',   desc: 'People & suspects',    icon: <User className="w-4 h-4" /> },
            { type: 'Date',   desc: 'Timing & planning',    icon: <Calendar className="w-4 h-4" /> },
            { type: 'Email',  desc: 'Contacts & addresses', icon: <Mail className="w-4 h-4" /> },
          ].map(({ type, desc, icon }) => (
            <div key={type} className="flex items-center gap-2.5 px-3 py-2.5 bg-[#D4AF37]/5 border border-[#D4AF37]/15 rounded-sm">
              <span className="text-[#D4AF37] shrink-0">{icon}</span>
              <div>
                <div className="font-mono text-xs font-bold text-[#D4AF37] uppercase tracking-wider">{type}</div>
                <div className="text-xs text-white/35 leading-tight">{desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { category: 'Salary',  template: 'Number', question: 'What\'s your salary?',                          note: 'Find out if you\'re in the same pay band without either person anchoring first' },
            { category: 'Source',  template: 'Name',   question: 'Who\'s your source for this story?',            note: 'Verify you\'re both protecting the same whistleblower before comparing notes' },
            { category: 'Gossip',  template: 'Name',   question: 'Who do you think is quitting next?',            note: 'Compare predictions without planting ideas if you\'re the only one who thinks so' },
            { category: 'Timing',  template: 'Date',   question: 'When are you planning to resign?',              note: 'Check if you\'re leaving together without tipping your hand if you\'re not' },
            { category: 'Leak',    template: 'Name',   question: 'Who do you think leaked the document?',         note: 'Name a suspect only if you\'re both already thinking the same person' },
            { category: 'Contact', template: 'Email',  question: 'What\'s your lawyer\'s email?',                 note: 'Verify you share the same counsel before your calls cross' },
          ].map(({ category, template, question, note }) => (
            <div
              key={question}
              className="glass-card rounded-sm p-4 border border-white/5 bg-[#0C0C0C]/40 flex flex-col gap-2 group hover:border-[#D4AF37]/20 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-[#D4AF37]/50">
                  {category}
                </span>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#D4AF37]/30 border border-[#D4AF37]/15 px-1.5 py-0.5 rounded-sm">
                  {template}
                </span>
              </div>
              <p className="font-heading italic text-white/80 text-base leading-snug group-hover:text-white transition-colors">
                "{question}"
              </p>
              <p className="text-xs text-white/25 leading-relaxed mt-auto pt-1 border-t border-white/5">
                {note}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Feature Bento Grid */}
      <div className="py-4 md:py-8 text-left">
        <h3 className="font-heading italic text-white text-xl mb-4 md:mb-8 border-b border-white/5 pb-2">
          The Protocol Design
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Bento Card 1 */}
          <div className="md:col-span-2 glass-card p-8 rounded-sm flex flex-col justify-between min-h-[250px] relative overflow-hidden group border border-white/5">
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none custom-pattern"></div>
            <div className="relative z-10">
              <div className="w-10 h-10 rounded-full bg-[#D4AF37]/5 border border-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] mb-4">
                <EyeOff className="w-5 h-5" />
              </div>
              <h4 className="font-heading italic text-xl text-white mb-2">Zero-Knowledge Privacy</h4>
              <p className="font-sans text-xs text-white/50 leading-relaxed max-w-lg">
                We use the Socialist Millionaire Protocol (SMP) to compare secrets cryptographically. Neither participant learns the other's secret unless they match. The server never sees any plaintext secrets, only encrypted data it cannot read.
              </p>
            </div>
            <div className="mt-6 border-t border-white/5 pt-4">
              <span className="text-[11px] text-[#D4AF37] font-semibold uppercase tracking-wider block mb-1">Mathematically Proven Privacy</span>
              <p className="text-[10px] text-white/40">Only the match status (yes/no) is revealed. Your secrets remain completely private.</p>
            </div>
          </div>

          {/* Bento Card 2 */}
          <div className="glass-card p-8 rounded-sm flex flex-col justify-between min-h-[250px] border border-white/5">
            <div>
              <div className="w-10 h-10 rounded-full bg-[#D4AF37]/5 border border-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] mb-4">
                <Fingerprint className="w-5 h-5" />
              </div>
              <h4 className="font-heading italic text-xl text-white mb-2">Cryptographic Security</h4>
              <p className="font-sans text-xs text-white/50 leading-relaxed">
                Using 1024-bit MODP cryptographic keys and client-generated random blinding factors, the Socialist Millionaire Protocol provides mathematically proven privacy. Even intercepted traffic cannot be reverse-engineered.
              </p>
            </div>
            <div className="pt-4">
              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="w-full h-full bg-[#D4AF37]"></div>
              </div>
              <span className="text-[10px] text-[#D4AF37] block mt-1.5 font-semibold">End-to-end encrypted</span>
            </div>
          </div>

          {/* Bento Card 3 */}
          <div className="glass-card p-8 rounded-sm flex flex-col min-h-[210px] border border-white/5">
            <div className="w-10 h-10 rounded-full bg-[#D4AF37]/5 border border-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] mb-4">
              <EyeOff className="w-5 h-5" />
            </div>
            <h4 className="font-heading italic text-xl text-white mb-2">Ephemeral Sessions</h4>
            <p className="font-sans text-xs text-white/50 leading-relaxed">
              Everything in samesecret is fully ephemeral. No match histories are saved, and no databases store your data. Closing your browser purges all secrets and session data instantly.
            </p>
          </div>

          {/* Bento Card 4 (Full Stretch Image overlay) */}
          <div className="md:col-span-2 relative rounded-sm overflow-hidden min-h-[210px] shadow-sm flex items-end border border-white/10 group">
            <div 
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 hover:scale-105" 
              style={{ backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuB3_uovwabLHJgEYZOEkKs10xos9-yzoDQkztj9JGWfIC6PlPsh0iDxjlxbCCN99Y_F-axS_zau2jlQVsGo_08SAGSu7R7K6-_Mpw47exAfSFZBD0J_644v5i6V4cuKNtJt13yd1fZ5jm74_q36KhI--LHMzaSAarzycAWKk8zWhf9YvpqOQv3w67HIXqrI6hGwUBH8z8Ng47HoPpncIaZlwGI_2gWB88PmhzD96EX8t0DOMlQ4h2eBApi1asEiFB-rDK_eGlp2aBOJ')` }}
            ></div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent"></div>
            
            <div className="relative z-10 p-8 flex items-start gap-4 text-left">
              <div className="p-2.5 bg-black/40 backdrop-blur-md rounded-sm text-[#D4AF37] border border-[#D4AF37]/30 shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-heading italic text-white text-base mb-1">Data Sovereignty</h4>
                <p className="font-sans text-xs text-white/70 leading-relaxed max-w-md">
                  Your data, your rules. Zero storage, zero logs, zero server access. All cryptographic operations happen entirely in your browser.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
