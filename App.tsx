import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ExtractedCode, EmailMessage } from './types';
import { analyzeEmailContent } from './services/geminiService';
import { initGoogleAuth, signIn, signOut, fetchRecentEmails } from './services/gmailService';
import { requestNotificationPermission, sendSystemNotification } from './services/notificationService';
import { CodeCard } from './components/CodeCard';
import { Inbox } from './components/MockInbox';
import { ShieldCheckIcon, RefreshCwIcon } from './components/Icon';

export default function App() {
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [codes, setCodes] = useState<ExtractedCode[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanningStatus, setScanningStatus] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Auth State
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [hasClientId, setHasClientId] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Tracking processed emails to prevent duplicates and loops
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());

  // Initialize Google Auth and Notification Permission
  useEffect(() => {
    requestNotificationPermission().then(granted => {
      if (granted) console.log("Notificaties toegestaan");
    });

    const timer = setTimeout(() => {
      const initialized = initGoogleAuth(
        (token) => {
          setAccessToken(token);
          setAuthError(null);
          showToast("Gmail verbonden!");
        },
        (error) => {
          console.error("Auth failed:", error);
          setAuthError("Inloggen mislukt. Controleer console.");
        }
      );
      setHasClientId(initialized);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const handleLogout = () => {
    signOut();
    setAccessToken(null);
    setEmails([]);
    setCodes([]);
    setAuthError(null);
    showToast("Uitgelogd");
  };

  // Logic to determine if an email is worth sending to AI
  const needsAnalysis = (email: EmailMessage): boolean => {
    // FORCE SCAN: If email is younger than 5 minutes, ALWAYS scan it.
    const emailDate = new Date(parseInt(email.internalDate));
    const now = new Date();
    const ageInMinutes = (now.getTime() - emailDate.getTime()) / 60000;
    
    if (ageInMinutes < 5) {
      console.log(`Force scanning recent email (${ageInMinutes.toFixed(1)}m old): ${email.subject}`);
      return true;
    }

    const combinedText = (email.subject + " " + email.body).toLowerCase();
    
    // Improved Regex to catch more formats
    const hasPossibleCode = /\b[a-z0-9]{4,8}\b|\b\d{3}[- ]\d{3}\b/i.test(combinedText);
    
    const keywords = [
      'code', 'verificatie', 'verification', 'login', 'aanmelden', 'sign in',
      'otp', '2fa', 'mfa', 'one-time', 'wachtwoord', 'password', 
      'security', 'beveiliging', 'toegang', 'access', 'confirm', 'bevestig', 'pin'
    ];
    
    const hasKeyword = keywords.some(k => combinedText.includes(k));

    return hasPossibleCode || hasKeyword;
  };

  const processEmail = async (email: EmailMessage, manual = false) => {
     setScanningStatus(`Analyseren: ${email.subject.substring(0, 25)}...`);
     
     const result = await analyzeEmailContent(email.body || email.snippet);
     
     if (result && result.hasCode) {
        const newCode: ExtractedCode = {
          id: email.id,
          serviceName: result.serviceName || email.sender.split('<')[0].replace(/"/g, '').trim(),
          code: result.code,
          timestamp: new Date(parseInt(email.internalDate)),
          rawEmailPreview: email.snippet
        };

        setCodes(prev => {
           if (prev.some(pc => pc.id === newCode.id)) return prev;

           if (!manual) {
               showToast(`Nieuwe code gevonden!`);
               const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');
               audio.volume = 0.5;
               audio.play().catch(() => {});
               sendSystemNotification(
                 `${newCode.serviceName}: ${newCode.code}`,
                 `Tik hier om code te kopiëren`,
                 () => {
                   navigator.clipboard.writeText(newCode.code);
                   window.focus();
                 }
               );
           } else {
             showToast("Code handmatig opgehaald!");
           }
           
           return [newCode, ...prev];
        });
     } else if (manual) {
       showToast("Geen code gevonden in deze e-mail.");
     }
  };

  // Fetch and Analyze Logic
  const handleFetchEmails = useCallback(async () => {
    if (!accessToken) return;
    
    setIsProcessing(true);
    setAuthError(null); // Reset error before trying

    try {
      const recentEmails = await fetchRecentEmails(accessToken);
      setEmails(recentEmails);

      const emailsToAnalyze = recentEmails.filter(email => !processedIds.has(email.id));
      
      if (emailsToAnalyze.length === 0) {
        setIsProcessing(false);
        setScanningStatus(null);
        return;
      }

      setProcessedIds(prev => {
        const next = new Set(prev);
        emailsToAnalyze.forEach(e => next.add(e.id));
        return next;
      });

      console.log(`Scanning ${emailsToAnalyze.length} new emails...`);

      // Process strictly sequentially to avoid hitting rate limits and to update UI clearly
      for (const email of emailsToAnalyze) {
        if (needsAnalysis(email)) {
          await processEmail(email);
        }
      }

    } catch (error: any) {
      console.error("Fout tijdens ophalen:", error);
      const msg = error.message || String(error);
      
      // Determine user-friendly error message
      if (msg.includes("403")) {
         if (msg.includes("API has not been used") || msg.includes("disabled")) {
             setAuthError("De Gmail API staat UIT in Google Cloud. Zet deze aan.");
         } else {
             setAuthError("Geen toegang. Log opnieuw in en vink alles aan.");
         }
      } else if (msg.includes("401")) {
         setAuthError("Sessie verlopen. Log opnieuw in.");
         setAccessToken(null);
      } else {
         setAuthError(`Fout: ${msg}`);
      }
    } finally {
      setIsProcessing(false);
      setScanningStatus(null);
    }
  }, [accessToken, processedIds]);

  // Handle Manual Click on Email
  const handleManualScan = async (email: EmailMessage) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await processEmail(email, true);
    } finally {
      setIsProcessing(false);
      setScanningStatus(null);
    }
  };

  // Polling
  useEffect(() => {
    if (accessToken) {
      handleFetchEmails();
      const interval = setInterval(handleFetchEmails, 15000); 
      return () => clearInterval(interval);
    }
  }, [accessToken, handleFetchEmails]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const currentOrigin = window.location.origin;

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
                <div className="flex items-center gap-2 ml-10">
                   {accessToken ? (
                     <button onClick={handleLogout} className="text-xs text-red-400 hover:text-red-300 underline">
                       Uitloggen
                     </button>
                   ) : (
                     <p className="text-xs text-slate-500">Auto-Scan Inactief</p>
                   )}
                </div>
            </div>
          </div>
        </div>
        
        {/* Auth Error Display */}
        {authError && (
           <div className="mx-6 mb-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg animate-pulse">
             <div className="flex flex-col gap-2">
               <div className="flex items-center gap-2 text-red-200 font-bold text-sm">
                 <span>⚠️</span> Actie vereist
               </div>
               <p className="text-xs text-red-100">{authError}</p>
               
               {authError.includes("API") && (
                 <a 
                   href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" 
                   target="_blank"
                   rel="noopener noreferrer"
                   className="text-xs bg-red-800 text-white py-1 px-2 rounded text-center hover:bg-red-700"
                 >
                   Zet Gmail API Aan &rarr;
                 </a>
               )}
               {(authError.includes("toegang") || authError.includes("Sessie")) && (
                  <button 
                   onClick={() => { handleLogout(); signIn(); }}
                   className="text-xs bg-red-800 text-white py-1 px-2 rounded text-center hover:bg-red-700"
                  >
                   Opnieuw verbinden
                  </button>
               )}
             </div>
           </div>
        )}

        {/* Client ID Warning */}
        {!hasClientId && !authError && (
           <div className="mx-6 mb-4 p-4 bg-yellow-900/20 border border-yellow-800/50 rounded-lg">
               <p className="text-yellow-200 text-xs">Geen Client ID gevonden.</p>
           </div>
        )}

        <div className="flex-1 px-4 pb-4 overflow-hidden">
           <Inbox 
             emails={emails} 
             onConnect={signIn}
             onRefresh={handleFetchEmails}
             onEmailClick={handleManualScan}
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
                Stuur een e-mail, de code verschijnt automatisch.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {isProcessing && (
              <div className="text-xs text-cyan-400 flex items-center gap-2 animate-pulse">
                <RefreshCwIcon className="w-3 h-3 animate-spin" />
                <span>Zoeken...</span>
              </div>
            )}
            {scanningStatus && (
               <div className="text-[10px] text-slate-500 font-mono bg-slate-900 px-2 py-1 rounded border border-slate-800">
                  {scanningStatus}
               </div>
            )}
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
                <p className="text-slate-600 text-sm mt-1">Recente e-mails worden automatisch gescand.</p>
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