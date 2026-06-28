/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface FooterProps {
  onNavigate: (view: 'home' | 'create' | 'join') => void;
}

export default function Footer({ onNavigate }: FooterProps) {
  return (
    <footer className="mt-6 md:mt-16 pb-20 md:pb-8 border-t border-white/5 bg-[#0C0C0C]/50 pt-5 md:pt-8 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
        <div 
          onClick={() => onNavigate('home')}
          className="flex items-center gap-2 opacity-70 cursor-pointer hover:opacity-100 transition-opacity"
        >
          <ShieldCheck className="w-5 h-5 text-[#D4AF37]" />
          <span className="font-heading italic font-bold text-[#D4AF37] text-sm">samesecret</span>
        </div>

        <div className="flex gap-6 text-xs text-white/40">
          <button 
            onClick={() => onNavigate('home')} 
            className="hover:text-[#D4AF37] transition-colors"
          >
            How it works
          </button>
          <a 
            href="#" 
            target="_blank" 
            referrerPolicy="no-referrer"
            className="hover:text-[#D4AF37] transition-colors"
          >
            Protocol Specs
          </a>
        </div>

        <p className="text-xs text-white/30 font-sans">
          &copy; {new Date().getFullYear()} Discreet Labs. Secure client-side cryptography.
        </p>
      </div>
    </footer>
  );
}
