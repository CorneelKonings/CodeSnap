import React, { useState, useEffect, useCallback } from 'react';
import { ExtractedCode, EmailMessage } from './types';
import { analyzeEmailContent } from './services/geminiService';
import { initGoogleAuth, signIn, fetchRecentEmails } from './services/gmailService';
import { requestNotificationPermission, sendSystemNotification } from './services/notificationService';
import { CodeCard } from './components/CodeCard';
import { Inbox } from './components/MockInbox';
import { ShieldCheckIcon } from './components/Icon';

export default function App() {
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [codes, setCodes] = useState<ExtractedCode[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Auth State
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [hasClientId, setHasClientId] = useState(true);

  // Initialize Google Auth and Notification Permission
  useEffect(() => {
    // 1. Request Notification Permission immediately
    requestNotificationPermission().then(granted => {
      if (granted) console.log("Notificaties toegestaan");
    });

    // 2. Initialize Google Auth
    const timer = setTimeout(() => {
      const initialized = initGoogleAuth((token) => {
        setAccessToken(token);
        showToast("Gmail verbonden!");
      });
      setHasClientId(initialized);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // Fetch and Analyze Logic
  const handleFetchEmails = useCallback(async () => {
    if (!accessToken) return;
    
    setIsProcessing(true);
    try {
      const recentEmails = await fetchRecentEmails(accessToken);
      
      // Update Inbox View
      setEmails(recentEmails);

      // Analyze new emails
      const analysisPromises = recentEmails.map(async (email) => {
        // Skip already found
        if (codes.some(c => c.id === email.id)) return null;

        const result = await analyzeEmailContent(email.body || email.snippet);
        if (result && result.hasCode) {
           return {
             id: email.id,
             serviceName: result.serviceName || "Onbekend",
             code: result.code,
             timestamp: new Date(parseInt(email.internalDate)),
             rawEmailPreview: email.snippet
           } as ExtractedCode;
        }
        return null;
      });

      const results = await Promise.all(analysisPromises);
      const foundCodes = results.filter((c): c is ExtractedCode => c !== null);
      
      if (foundCodes.length > 0) {
        setCodes(prev => {
          const newCodes = foundCodes.filter(nc => !prev.some(pc => pc.id === nc.id));
          
          if (newCodes.length > 0) {
            // 1. Toast in App
            showToast(`${newCodes.length} nieuwe code(s)!`);
            
            // 2. Play Sound
            const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');
            audio.volume = 0.2;
            audio.play().catch(() => {});

            // 3. System Notification with Copy Action
            const newestCode = newCodes[0];
            sendSystemNotification(
              `Code: ${newestCode.serviceName}`,
              `${newestCode.code} - Tik om te kopiëren`,
              () => {
                // Try to copy immediately on notification click
                navigator.clipboard.writeText(newestCode.code)
                  .then(() => showToast("Code gekopieerd!"))
                  .catch(() => showToast("Code geselecteerd"));
              }
            );
          }
          return [...newCodes, ...prev];
        });
      }

    } catch (error) {
      console.error("Fout tijdens ophalen:", error);
      showToast("Fout bij ophalen e-mails");
    } finally {
      setIsProcessing(false);
    }
  }, [accessToken, codes]);

  // Polling / Auto-fetch when connected
  useEffect(() => {
    if (accessToken) {
      handleFetchEmails();
      // Optional: Poll every 30 seconds
      const interval = setInterval(handleFetchEmails, 30000);
      return () => clearInterval(interval);
    }
  }, [accessToken, handleFetchEmails]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col md:flex-row overflow-hidden max-w-7xl mx-auto shadow-2xl shadow-black">
      
      {/* Sidebar / Left Panel */}
      <div className="w-full md:w-96 md:border-r border-slate-800 flex flex-col h-[40vh] md:h-screen">
        <div className="p-6">
          <div className="flex justify-between items-start">
            <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2 mb-1">
                    <span className="bg-gradient-to-tr from-cyan-500 to-blue-600 w-8 h-8 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
                    <ShieldCheckIcon className="w-5 h-5 text-white" />
                    </span>
                    CodeSnap
                </h1>
                <p className="text-xs text-slate-500 ml-10">Real-time 2FA Scanner</p>
            </div>
          </div>
        </div>
        
        {!hasClientId && (
           <div className="mx-6 mb-4 p-4 bg-red-900/20 border border-red-800/50 rounded-lg animate-pulse">
             <div className="flex flex-col gap-2">
               <div className="flex items-center gap-2 text-red-200 font-medium text-sm">
                 <span>⚠️</span> Configuratie ontbreekt
               </div>
               <p className="text-red-300/80 text-xs">
                 Je hebt een <code>GOOGLE_CLIENT_ID</code> nodig om te verbinden met Gmail.
               </p>
               <a 
                 href="https://console.cloud.google.com/apis/credentials" 
                 target="_blank"
                 rel="noopener noreferrer"
                 className="text-xs font-bold text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1"
               >
                 Maak ID aan in Google Cloud Console &rarr;
               </a>
               <div className="text-[10px] text-slate-500 mt-1">
                 Zorg dat "Authorized JavaScript origins" ingesteld staat op: <br/> 
                 <code className="bg-slate-900 px-1 rounded">{window.location.origin}</code>
               </div>
             </div>
           </div>
        )}

        <div className="flex-1 px-4 pb-4 overflow-hidden">
           <Inbox 
             emails={emails} 
             onConnect={signIn}
             onRefresh={handleFetchEmails}
             isConnected={!!accessToken}
             isProcessing={isProcessing} 
           />
        </div>
      </div>

      {/* Main Content / Right Panel */}
      <div className="flex-1 flex flex-col h-[60vh] md:h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 relative">
        
        <div className="p-6 md:p-10 pb-0 z-10 flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Jouw Codes</h2>
            <p className="text-slate-400 text-sm max-w-md">
                Verbind Gmail. Ontvang notificaties. Tik om te kopiëren.
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-10 pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 auto-rows-min">
            {codes.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/50">
                <div className="bg-slate-800 p-4 rounded-full mb-4">
                  <ShieldCheckIcon className="w-8 h-8 text-slate-500" />
                </div>
                <p className="text-slate-400 font-medium">Nog geen codes</p>
                <p className="text-slate-600 text-sm mt-1">Wachten op inkomende e-mails...</p>
              </div>
            ) : (
              codes.map((code) => (
                <CodeCard key={code.id} data={code} />
              ))
            )}
          </div>
        </div>

        {toastMessage && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-cyan-600 text-white px-6 py-3 rounded-full shadow-xl shadow-cyan-900/50 flex items-center gap-3 animate-bounce-in font-medium z-50 pointer-events-none">
            <ShieldCheckIcon className="w-5 h-5" />
            {toastMessage}
          </div>
        )}
      </div>
    </div>
  );
}