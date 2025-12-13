import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ExtractedCode, EmailMessage } from './types';
import { analyzeEmailContent } from './services/geminiService';
import { initGoogleAuth, signIn, fetchRecentEmails } from './services/gmailService';
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
  const [authError, setAuthError] = useState<any | null>(null);

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
          setAuthError(error);
          showToast("Inloggen mislukt");
        }
      );
      setHasClientId(initialized);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // Logic to determine if an email is worth sending to AI
  const needsAnalysis = (email: EmailMessage): boolean => {
    const combinedText = (email.subject + " " + email.body).toLowerCase();
    
    // Improved Regex to catch more formats:
    // Matches: 123456, 123-456, 123 456, A1B2C3, R5T21 (Alphanumeric 4-8 chars)
    const hasPossibleCode = /\b[a-z0-9]{4,8}\b|\b\d{3}[- ]\d{3}\b/i.test(combinedText);
    
    const keywords = [
      'code', 'verificatie', 'verification', 'login', 'aanmelden', 'sign in',
      'otp', '2fa', 'mfa', 'one-time', 'wachtwoord', 'password', 
      'security', 'beveiliging', 'toegang', 'access', 'confirm', 'bevestig', 'pin'
    ];
    
    const hasKeyword = keywords.some(k => combinedText.includes(k));

    return hasPossibleCode || hasKeyword;
  };

  // Fetch and Analyze Logic
  const handleFetchEmails = useCallback(async () => {
    if (!accessToken) return;
    
    setIsProcessing(true);
    try {
      const recentEmails = await fetchRecentEmails(accessToken);
      
      // Update Inbox View (Always show latest)
      setEmails(recentEmails);

      // Filter: only analyze emails we haven't processed yet
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

      const analysisPromises = emailsToAnalyze.map(async (email) => {
        // Pre-check
        if (!needsAnalysis(email)) {
           return null;
        }
        
        setScanningStatus(`Analyseren: ${email.subject.substring(0, 20)}...`);
        const result = await analyzeEmailContent(email.body || email.snippet);
        
        if (result && result.hasCode) {
           return {
             id: email.id,
             serviceName: result.serviceName || email.sender.split('<')[0].replace(/"/g, '').trim(),
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
            showToast(`${newCodes.length} nieuwe code(s)!`);
            
            const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');
            audio.volume = 0.5;
            audio.play().catch(() => {});

            const newestCode = newCodes[0];
            sendSystemNotification(
              `${newestCode.serviceName}: ${newestCode.code}`,
              `Tik hier om code te kopiëren`,
              () => {
                navigator.clipboard.writeText(newestCode.code)
                  .then(() => showToast("Code gekopieerd!"))
                  .catch(() => showToast("Code geselecteerd"));
                window.focus();
              }
            );
          }
          return [...newCodes, ...prev];
        });
      }

    } catch (error) {
      console.error("Fout tijdens ophalen:", error);
    } finally {
      setIsProcessing(false);
      setScanningStatus(null);
    }
  }, [accessToken, processedIds]);

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
                   <p className="text-xs text-slate-500">Auto-Scan Actief</p>
                   {accessToken && (
                     <span className="relative flex h-2 w-2">
                       <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                       <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                     </span>
                   )}
                </div>
            </div>
          </div>
        </div>
        
        {/* Auth Configuration Helper */}
        {(!hasClientId || authError) && (
           <div className="mx-6 mb-4 p-4 bg-red-900/20 border border-red-800/50 rounded-lg">
             <div className="flex flex-col gap-2">
               <div className="flex items-center gap-2 text-red-200 font-medium text-sm">
                 <span>⚠️</span> Inlogprobleem gedetecteerd
               </div>
               
               {authError ? (
                  <div className="text-xs text-red-300">
                    Foutmelding: {JSON.stringify(authError.type || authError.message || authError)}
                    <br/><br/>
                    Controleer of de <strong>Origin</strong> hieronder exact overeenkomt in Google Cloud.
                  </div>
               ) : (
                  <p className="text-red-300/80 text-xs">
                    Je <code>GOOGLE_CLIENT_ID</code> ontbreekt of is onjuist.
                  </p>
               )}

               <div className="mt-2 bg-slate-950 p-2 rounded border border-slate-800">
                 <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Huidige Origin (Kopieer dit):</div>
                 <code className="text-xs text-cyan-400 break-all select-all font-mono block">
                   {currentOrigin}
                 </code>
               </div>

               <a 
                 href="https://console.cloud.google.com/apis/credentials" 
                 target="_blank"
                 rel="noopener noreferrer"
                 className="text-xs font-bold text-white hover:text-cyan-300 hover:underline mt-1"
               >
                 Open Google Cloud Console &rarr;
               </a>
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
                Er wordt elke 15 seconden gezocht naar nieuwe codes.
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
               <div className="text-[10px] text-slate-500 font-mono">
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
                <p className="text-slate-600 text-sm mt-1">Stuur jezelf een test e-mail met een code.</p>
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