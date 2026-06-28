/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  Copy, 
  Lock, 
  AlertTriangle, 
} from 'lucide-react';
import QRCode from 'qrcode';
import { MatchTemplate } from '../types';
import { smpStep3, verifySMP } from '../utils/smp';
import { decryptAES } from '../utils/crypto';
import { api } from '../lib/api';

interface RoomCreatedProps {
  roomId: string;
  accessCode: string;
  question: string;
  template: MatchTemplate;
  onMatchFinished: (status: 'matched' | 'no_match' | 'cancelled', partnerName?: string) => void;
  onHome: () => void;
}

export default function RoomCreated({ roomId, accessCode, question, template, onMatchFinished, onHome }: RoomCreatedProps) {
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [pollingError, setPollingError] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  
  const savedKey = typeof window !== 'undefined' ? sessionStorage.getItem(`smp_room_key_${roomId}`) : null;
  // Create invitation URL dynamically with room key stored in hash fragment (which is never sent to the server)
  const inviteUrl = savedKey
    ? `${window.location.origin}/?join=${accessCode}#${savedKey}`
    : `${window.location.origin}/?join=${accessCode}`;

  const copyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyKey = () => {
    if (savedKey) {
      navigator.clipboard.writeText(savedKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  // Generate real QR code
  useEffect(() => {
    if (inviteUrl) {
      QRCode.toDataURL(inviteUrl, {
        margin: 1.5,
        width: 256,
        color: {
          dark: '#D4AF37',   // Gold color
          light: '#0a0a0a'  // Deep dark backgrounds
        }
      })
      .then(url => {
        setQrCodeDataUrl(url);
      })
      .catch(err => {
        console.error('QR code generation error:', err);
      });
    }
  }, [inviteUrl]);

  // Status Polling Loop with exponential backoff on errors/rate-limits
  useEffect(() => {
    if (!roomId) return;
    let active = true;
    let isFinalizing = false;
    let backoffMs = 3000;
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNext = () => {
      if (active) timeoutId = setTimeout(poll, backoffMs);
    };

    const poll = async () => {
      try {
        const res = await fetch(api(`/api/rooms/${roomId}/status`));
        if (!res.ok) throw new Error('connection lost');
        
        const data = await res.json();
        
        if (data.status === 'joiner_submitted' && !isFinalizing) {
          isFinalizing = true;
          
          try {
            // Retrieve our private values
            const roomData = JSON.parse(sessionStorage.getItem(`smp_room_${roomId}`) || '{}');
            const a2 = BigInt(roomData.a2);
            const a3 = BigInt(roomData.a3);
            const secret = roomData.secret;
            
            // Get joiner's public values
            const g2b = BigInt(data.joinerG2b);
            const g3b = BigInt(data.joinerG3b);
            const pb = BigInt(data.joinerPb);
            const qb = BigInt(data.joinerQb);
            
            // SMP Step 3: Generate our response
            const step3 = await smpStep3(secret, a2, a3, g2b, g3b, pb, qb);
            
            // Send to server
            await fetch(api(`/api/rooms/${roomId}/respond`), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                creatorPa: step3.pa.toString(),
                creatorQa: step3.qa.toString(),
                creatorRa: step3.ra.toString(),
              }),
            });

            // Store pa and pb for final verification
            sessionStorage.setItem(`smp_verify_${roomId}`, JSON.stringify({
              pa: step3.pa.toString(),
              pb: pb.toString(),
            }));
            
          } catch (err) {
            console.error('SMP step 3 error:', err);
          } finally {
            isFinalizing = false;
          }
        } else if (data.status === 'completed') {
          // Verify locally: rab * pa ≡ pb (mod P)
          const verifyData = JSON.parse(sessionStorage.getItem(`smp_verify_${roomId}`) || '{}');
          const pa  = BigInt(verifyData.pa  || '0');
          const pb  = BigInt(verifyData.pb  || '0');
          const rab = BigInt(data.joinerRb);

          const isMatch = verifySMP(rab, pa, pb);
          
          // Decrypt joiner name if match
          let joinerName = data.joinerName || 'Joiner';
          if (isMatch) {
            const savedKey = sessionStorage.getItem(`smp_room_key_${roomId}`);
            if (savedKey) {
              try {
                const keyBytes = new Uint8Array(savedKey.length / 2);
                for (let i = 0; i < keyBytes.length; i++) {
                  keyBytes[i] = parseInt(savedKey.substring(i * 2, i * 2 + 2), 16);
                }
                joinerName = await decryptAES(joinerName, keyBytes);
              } catch {}
            }
          }
          // If name still looks like encrypted hex, show a safe fallback
          if (/^[0-9a-fA-F]{24,}$/.test(joinerName)) {
            joinerName = 'Encrypted';
          }
          
          return onMatchFinished(isMatch ? 'matched' : 'no_match', joinerName);
        }
      } catch (err) {
        setPollingError(true);
      }
      scheduleNext();
    };

    scheduleNext();
    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [roomId, accessCode, question]);

  const cancelRoom = async () => {
    try {
      await fetch(api(`/api/rooms/${roomId}/cancel`), { method: 'POST' });
    } catch (e) {
      console.error(e);
    } finally {
      // Remove room from active session storage list
      try {
        const roomsJson = sessionStorage.getItem('secret_matcher_active_session_rooms');
        if (roomsJson) {
          const list = JSON.parse(roomsJson);
          const filtered = list.filter((r: any) => r.roomId !== roomId);
          sessionStorage.setItem('secret_matcher_active_session_rooms', JSON.stringify(filtered));
        }
      } catch (sessionErr) {
        console.error('Session storage update error:', sessionErr);
      }
      onHome();
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-4 md:space-y-8 animate-fade-in text-center my-2 md:my-6">
      {/* Title block */}
      <div className="space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 mb-2 shadow-inner">
          <CheckCircle className="w-8 h-8 font-extrabold" />
        </div>
        <h2 className="font-heading italic text-white text-2xl md:text-3xl">
          Room Created!
        </h2>
        <p className="font-sans text-xs text-white/50 max-w-[300px] mx-auto leading-relaxed">
          Your secure encryption tunnel is established and ready for pairing.
        </p>
      </div>

      {/* Interactive central visual block */}
      <div className="glass-card rounded-sm p-6 flex flex-col items-center border border-white/5 bg-[#0C0C0C]/50">
        <div className="relative p-3 bg-black/40 rounded-sm border border-white/5 mb-6 transition-transform hover:scale-105 duration-300">
          <div className="w-48 h-48 bg-zinc-950 flex items-center justify-center relative overflow-hidden rounded-sm border border-[#D4AF37]/20 p-2">
            {qrCodeDataUrl ? (
              <img 
                src={qrCodeDataUrl} 
                alt="Invite QR Code" 
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="text-zinc-500 font-mono text-[10px] animate-pulse">Encoding QR...</div>
            )}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-9 h-9 bg-[#0c0c0c] rounded-sm flex items-center justify-center shadow-lg border border-[#D4AF37]/30">
                <Lock className="w-4 h-4 text-[#D4AF37]" />
              </div>
            </div>
          </div>
        </div>

        {/* Links input copies */}
        <div className="w-full space-y-4">
          <div className="flex flex-col space-y-1 text-left">
            <label className="font-sans text-[11px] font-bold text-white/40 uppercase tracking-widest pl-1">
              Invite Link
            </label>
            <div className="flex items-center gap-2 bg-black/40 border border-white/10 p-1 rounded-sm">
              <span className="font-mono text-xs text-white/60 truncate flex-grow pl-3">
                {inviteUrl}
              </span>
              <button 
                onClick={copyLink}
                className={`flex items-center justify-center w-9 h-9 rounded-sm active:scale-95 transition-all text-black cursor-pointer ${
                  copied ? 'bg-green-500 text-white' : 'bg-[#D4AF37] hover:bg-[#C9A028]'
                }`}
              >
                {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Code + Key row */}
          <div className="flex gap-2">
            {/* Access code */}
            <div className="flex-1 flex items-center justify-between p-3 bg-[#D4AF37]/5 rounded-sm border border-[#D4AF37]/20">
              <div className="flex flex-col text-left">
                <span className="font-sans text-[11px] font-bold text-white/40 uppercase tracking-widest">Code</span>
                <span className="font-mono text-xl font-bold tracking-widest text-[#D4AF37] uppercase">{accessCode}</span>
              </div>
              <div className="flex gap-1 items-center">
                <div className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse"></div>
                <div className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>

            {/* Decryption key (share separately if needed) */}
            {savedKey && (
              <div className="flex flex-col justify-between p-3 bg-white/[0.02] rounded-sm border border-white/10 text-left min-w-0">
                <span className="font-sans text-[11px] font-bold text-white/30 uppercase tracking-widest mb-1">Decryption Key</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-white/30 truncate">
                    {savedKey.slice(0, 8)}…{savedKey.slice(-4)}
                  </span>
                  <button
                    onClick={copyKey}
                    title="Copy full key — share this separately if you sent the code by other means"
                    className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-sm active:scale-95 transition-all cursor-pointer ${
                      copiedKey ? 'bg-green-500/20 text-green-400' : 'bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70'
                    }`}
                  >
                    {copiedKey ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <span className="font-sans text-[10px] text-white/20 mt-1 leading-tight">Share separately if sending code by text</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Radar Pulse Status Bar */}
      <div className="flex items-center gap-3 justify-center py-2">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-8 h-8 rounded-full bg-[#D4AF37] opacity-20 animate-ping"></div>
          <div className="w-3.5 h-3.5 rounded-full bg-[#D4AF37] shadow-[0_0_8px_rgba(212,175,55,0.5)]"></div>
        </div>
        <span className="font-sans text-xs font-semibold text-[#D4AF37] animate-pulse-soft">
          {pollingError ? 'Re-establishing network linkage...' : 'Waiting for other person...'}
        </span>
      </div>

      {/* Cancellation CTA */}
      <div className="pt-4">
        <button 
          onClick={cancelRoom}
          className="flex items-center justify-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-950/20 hover:bg-red-900/30 border border-red-500/20 px-6 py-2.5 rounded-sm max-w-[200px] mx-auto active:scale-95 transition-all cursor-pointer"
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Cancel Room</span>
        </button>
      </div>
    </div>
  );
}
