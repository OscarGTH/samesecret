/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  Copy, 
  CheckSquare, 
  Terminal, 
  Lock, 
  Loader2, 
  AlertTriangle, 
  ExternalLink 
} from 'lucide-react';
import QRCode from 'qrcode';
import { MatchTemplate } from '../types';
import { modPow, P } from '../utils/smp';
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

  // Status Polling Loop
  useEffect(() => {
    let active = true;
    let isFinalizing = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(api(`/api/rooms/${roomId}/status`));
        if (!res.ok) {
          throw new Error('Lost connection to Check Room');
        }
        
        const data = await res.json();
        
        if (!active) return;

        if (data.status === 'joiner_submitted' && !isFinalizing) {
          isFinalizing = true;
          try {
            const privateKeyAStr = sessionStorage.getItem(`smp_private_key_${roomId}`);
            if (privateKeyAStr && data.joinerSmpB) {
              const a = BigInt(privateKeyAStr);
              const B = BigInt(data.joinerSmpB);
              const C_A = modPow(B, a, P);

              // Dispatch the final CA to finalize the handshake!
              const finalizeRes = await fetch(api(`/api/rooms/${roomId}/finalize`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ creatorSmpCA: C_A.toString() }),
              });
              if (!finalizeRes.ok) {
                console.error('Handshake finalization failure');
              }
            }
          } catch (handshakeErr) {
            console.error('Error in secure SMP handshake calculation:', handshakeErr);
          } finally {
            isFinalizing = false;
          }
        } else if (data.status === 'matched') {
          clearInterval(interval);
          let decryptedJoinerName = data.joinerName || 'Joiner';
          const savedKey = sessionStorage.getItem(`smp_room_key_${roomId}`);
          if (savedKey && decryptedJoinerName) {
            try {
              const hexRegex = /^[0-9a-fA-F]+$/;
              if (hexRegex.test(decryptedJoinerName) && decryptedJoinerName.length >= 24) {
                const keyBytes = new Uint8Array(savedKey.length / 2);
                for (let i = 0; i < keyBytes.length; i++) {
                  keyBytes[i] = parseInt(savedKey.substring(i * 2, i * 2 + 2), 16);
                }
                const { decryptAES } = await import('../utils/crypto');
                decryptedJoinerName = await decryptAES(decryptedJoinerName, keyBytes);
              }
            } catch (errDecrypt) {
              console.error('Failed to decrypt joinerName on match:', errDecrypt);
            }
          }
          onMatchFinished('matched', decryptedJoinerName);
        } else if (data.status === 'no_match') {
          clearInterval(interval);
          onMatchFinished('no_match');
        } else if (data.status === 'cancelled') {
          clearInterval(interval);
          onMatchFinished('cancelled');
        }
      } catch (err) {
        console.error('Polling error:', err);
        setPollingError(true);
      }
    }, 2000);

    return () => {
      active = false;
      clearInterval(interval);
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
            <label className="font-sans text-[9px] font-bold text-white/40 uppercase tracking-widest pl-1">
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

          {/* Backup Alphanumeric code */}
          <div className="flex items-center justify-between p-4 bg-[#D4AF37]/5 rounded-sm border border-[#D4AF37]/20">
            <div className="flex flex-col text-left">
              <span className="font-sans text-[9px] font-bold text-white/40 uppercase tracking-widest">
                Backup Code
              </span>
              <span className="font-mono text-xl font-bold tracking-widest text-[#D4AF37] uppercase">
                {accessCode}
              </span>
            </div>
            
            <div className="flex gap-1.5 items-center">
              <div className="w-2.5 h-2.5 rounded-full bg-[#D4AF37] animate-pulse"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-[#D4AF37] animate-pulse" style={{ animationDelay: '0.4s' }}></div>
            </div>
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
