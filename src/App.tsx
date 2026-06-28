/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import CreateCheck from './components/CreateCheck';
import RoomCreated from './components/RoomCreated';
import JoinCheck from './components/JoinCheck';
import EnterSecret from './components/EnterSecret';
import MatchResult from './components/MatchResult';
import Footer from './components/Footer';

import { RoomState, MatchTemplate } from './types';
import { Home, ShieldCheck, PlusSquare } from 'lucide-react';

type MainView = 'home' | 'create' | 'join' | 'waiting_creator' | 'enter_secret' | 'match_result';

export default function App() {
  const [view, setView] = useState<MainView>('home');
  const [joinCode, setJoinCode] = useState('');
  
  // States representing room matching states
  const [createdRoomData, setCreatedRoomData] = useState<{ roomId: string; accessCode: string; question: string; template: MatchTemplate; roomKeyHex?: string } | null>(null);
  const [activeRoomState, setActiveRoomState] = useState<RoomState | null>(null);
  const [matchOutcome, setMatchOutcome] = useState<{ status: 'matched' | 'no_match' | 'cancelled'; partnerName?: string } | null>(null);

  // Scroll to top on every view change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  // Monitor URL parameters for immediate "Pair Check Link" redirects!
  useEffect(() => {
    // Process and keep client-side hash secret room verification keys safely in sessionStorage
    const hashVal = window.location.hash.substring(1);
    const hexRegex = /^[0-9a-fA-F]{64}$/;
    if (hashVal && hexRegex.test(hashVal)) {
      sessionStorage.setItem('smp_current_url_key', hashVal);
    }

    const params = new URLSearchParams(window.location.search);
    const codeVal = params.get('join');
    if (codeVal && codeVal.length === 6) {
      setJoinCode(codeVal.toUpperCase());
      setView('join');
    }
  }, []);

  // Root navigating handlers
  const handleNavigate = (targetView: 'home' | 'create' | 'join') => {
    setView(targetView);
    // Reset parameters
    setJoinCode('');
  };

  const handleRoomCreated = (roomId: string, accessCode: string, question: string, template: MatchTemplate, roomKeyHex?: string) => {
    setCreatedRoomData({ roomId, accessCode, question, template, roomKeyHex });
    setView('waiting_creator');
  };

  const handleRoomSelectedForJoin = (roomData: RoomState) => {
    setActiveRoomState(roomData);
    setView('enter_secret');
  };

  const handleMatchFinishedState = (status: 'matched' | 'no_match' | 'cancelled', partnerName?: string) => {
    const closedRoomId = activeRoomState?.id || createdRoomData?.roomId;
    if (closedRoomId) {
      try {
        const roomsJson = sessionStorage.getItem('secret_matcher_active_session_rooms');
        if (roomsJson) {
          const list = JSON.parse(roomsJson);
          const filtered = list.filter((r: any) => r.roomId !== closedRoomId);
          sessionStorage.setItem('secret_matcher_active_session_rooms', JSON.stringify(filtered));
        }
      } catch (e) {
        console.error('Session storage cleaning error:', e);
      }
    }
    setMatchOutcome({ status, partnerName });
    setView('match_result');
  };

  const handleRejoinRoom = async (roomId: string, role: 'creator' | 'joiner') => {
    try {
      const { api } = await import('./lib/api');
      const res = await fetch(api(`/api/rooms/${roomId}/status`));
      if (!res.ok) {
        alert('This room has either expired, completed, or been cancelled on the server.');
        // Prune the expired room immediately from session storage
        try {
          const roomsJson = sessionStorage.getItem('secret_matcher_active_session_rooms');
          if (roomsJson) {
            const list = JSON.parse(roomsJson);
            const filtered = list.filter((r: any) => r.roomId !== roomId);
            sessionStorage.setItem('secret_matcher_active_session_rooms', JSON.stringify(filtered));
          }
        } catch (e) {}
        return;
      }
      const data = await res.json();
      
      if (role === 'creator') {
        let decryptedQuestion = data.question;
        const savedKey = sessionStorage.getItem(`smp_room_key_${data.id}`);
        if (savedKey) {
          try {
            const keyBytes = new Uint8Array(savedKey.length / 2);
            for (let i = 0; i < keyBytes.length; i++) {
              keyBytes[i] = parseInt(savedKey.substring(i * 2, i * 2 + 2), 16);
            }
            const { decryptAES } = await import('./utils/crypto');
            decryptedQuestion = await decryptAES(data.question, keyBytes);
          } catch (e) {
            console.error('Failed to decrypt question on creator rejoin:', e);
          }
        }

        setCreatedRoomData({
          roomId: data.id,
          accessCode: data.accessCode,
          question: decryptedQuestion,
          template: data.template,
        });
        setView('waiting_creator');
      } else {
        let decryptedCreatorName = data.creatorName || 'Creator';
        let decryptedJoinerName = data.joinerName;
        
        let savedKey = sessionStorage.getItem(`smp_room_key_${data.id}`) || '';
        if (!savedKey) {
          savedKey = sessionStorage.getItem('smp_current_url_key') || '';
        }
        if (!savedKey && window.location.hash) {
          const hashVal = window.location.hash.substring(1);
          const hexRegex = /^[0-9a-fA-F]{64}$/;
          if (hashVal && hexRegex.test(hashVal)) {
            savedKey = hashVal;
          }
        }

        if (savedKey) {
          try {
            const keyBytes = new Uint8Array(savedKey.length / 2);
            for (let i = 0; i < keyBytes.length; i++) {
              keyBytes[i] = parseInt(savedKey.substring(i * 2, i * 2 + 2), 16);
            }
            const { decryptAES } = await import('./utils/crypto');
            const hexRegex = /^[0-9a-fA-F]+$/;
            if (decryptedCreatorName && hexRegex.test(decryptedCreatorName) && decryptedCreatorName.length >= 24) {
              decryptedCreatorName = await decryptAES(decryptedCreatorName, keyBytes);
            }
            if (decryptedJoinerName && hexRegex.test(decryptedJoinerName) && decryptedJoinerName.length >= 24) {
              decryptedJoinerName = await decryptAES(decryptedJoinerName, keyBytes);
            }
          } catch (e) {
            console.error('Failed to decrypt participant names on rejoin:', e);
          }
        }

        const roomState: RoomState = {
          id: data.id,
          accessCode: data.accessCode,
          question: data.question,
          template: data.template,
          caseSensitive: data.caseSensitive !== false,
          ignoreWhitespace: data.ignoreWhitespace !== false,
          selfDestruct: data.selfDestruct !== false,
          status: data.status,
          creatorName: decryptedCreatorName,
          joinerName: decryptedJoinerName,
          creatorG2a: data.creatorG2a,
          creatorG3a: data.creatorG3a,
          templateConfig: data.templateConfig,
        };
        setActiveRoomState(roomState);
        setView('enter_secret');
      }
    } catch (err) {
      console.error('Error rejoining room session:', err);
    }
  };

  // Mobile navigation selector mappings
  const getActiveTabClass = (tabViews: MainView[]) => {
    const isActive = tabViews.includes(view);
    return isActive 
      ? 'flex flex-col items-center justify-center bg-[#D4AF37] text-black rounded-full p-2.5 scale-95 duration-200'
      : 'flex flex-col items-center justify-center text-gray-400 p-2.5 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37] rounded-full transition-colors';
  };

  return (
    <div className="min-h-screen flex flex-[#f6fafb] flex-col font-sans overflow-x-hidden pt-14">
      {/* Top Navigation bar */}
      <Navbar onNavigate={handleNavigate} currentView={view} />

      {/* Main Container Stage */}
      <main className="flex-grow max-w-6xl mx-auto w-full px-4 md:px-6 py-4 md:py-16">
        {view === 'home' && (
          <HeroSection onAction={handleNavigate} onRejoinRoom={handleRejoinRoom} />
        )}

        {view === 'create' && (
          <CreateCheck onRoomCreated={handleRoomCreated} />
        )}

        {view === 'waiting_creator' && createdRoomData && (
          <RoomCreated 
            roomId={createdRoomData.roomId}
            accessCode={createdRoomData.accessCode}
            question={createdRoomData.question}
            template={createdRoomData.template}
            onHome={() => setView('home')}
            onMatchFinished={handleMatchFinishedState}
          />
        )}

        {view === 'join' && (
          <JoinCheck 
            onRoomSelected={handleRoomSelectedForJoin} 
            onHome={() => setView('home')} 
            initialCode={joinCode}
          />
        )}

        {view === 'enter_secret' && activeRoomState && (
          <EnterSecret 
            room={activeRoomState} 
            onHome={() => setView('home')}
            onJoinComplete={(status, partnerName) => handleMatchFinishedState(status, partnerName)}
          />
        )}

        {view === 'match_result' && matchOutcome && (
          <MatchResult 
            status={matchOutcome.status}
            partnerName={matchOutcome.partnerName}
            onHome={() => setView('home')}
            onRestart={() => setView('create')}
          />
        )}
      </main>

      {/* Foot banner layouts */}
      <Footer onNavigate={handleNavigate} />

      {/* Polish Interactive Mobile Bottom Bar navigation schema inside screenshots */}
      <nav className="fixed bottom-0 left-0 w-full z-40 bg-zinc-950/90 backdrop-blur-md border-t border-white/5 flex justify-around items-center px-4 py-2 hover:shadow-lg md:hidden">
        {/* Tab item home */}
        <button 
          onClick={() => handleNavigate('home')}
          className={getActiveTabClass(['home'])}
          title="Home"
        >
          <Home className="w-5 h-5 font-bold" />
        </button>

        {/* Tab item create check room */}
        <button 
          onClick={() => handleNavigate('create')}
          className={getActiveTabClass(['create', 'waiting_creator'])}
          title="Create Check"
        >
          <PlusSquare className="w-5 h-5" />
        </button>
      </nav>
    </div>
  );
}
