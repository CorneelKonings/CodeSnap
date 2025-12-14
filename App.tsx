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
  
  // Track status of each email: 'pending', 'analyzing', 'found', 'none', 'skipped'
  const [scanResults, setScanResults] = useState<Record<string, 'analyzing' | 'found' | 'none' | 'skipped'>>({});
  
  // Auth State
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [hasClientId, setHasClientId] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Tracking processed emails to prevent duplicates and loops
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());

  // Initialize Google Auth, Notification Permission, and Check LocalStorage
  useEffect(() => {
    // 1. Request Notifications
    requestNotificationPermission().then(granted => {
      if (granted) console.log("Notificaties toegestaan");
    });

    // 2. Check for existing session in localStorage
    const storedToken = localStorage.getItem('google_access_token');
    const storedTime = localStorage.getItem('google_token_time');
    
    if (storedToken && storedTime) {
      const ageInMinutes = (Date.now() - parseInt(storedTime)) / 1000 / 60;
      // Tokens expire after 60 mins. We use 55 mins as a safety buffer.
      if (ageInMinutes < 55) {
        console.log("Restoring session from storage");
        setAccessToken(storedToken);
      } else {
        console.log("Session expired, clearing storage");
        localStorage.removeItem('google_access_token');
        localStorage.removeItem('google_token_time');
      }
    }

    // 3. Initialize Google Auth Client (needed for re-login or fresh login)
    const timer = setTimeout(() => {
      const initialized = initGoogleAuth(
        (token) => {
          // Success Callback
          setAccessToken(token);
          setAuthError(null);
          
          // Save to storage
          localStorage.setItem('google_access_token', token);
          localStorage.setItem('google_token_time', Date.now().toString());
          
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

  // PREVENT ACCIDENTAL CLOSING
  // This keeps the app "alive" by warning the user if they click X
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (accessToken) {
        // Standard way to trigger browser confirmation dialog
        e.preventDefault();
        e.returnValue = 'Als je de pagina sluit, stopt het scannen. Minimaliseer het venster in plaats van te sluiten.';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [accessToken]);

  const handleLogout = () => {
    signOut();
    setAccessToken(null);
    setEmails([]);
    setCodes([]);
    setAuthError(null);
    setScanResults({});
    setProcessedIds(new Set());
    
    // Clear storage
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_token_time');
    
    showToast("Uitgelogd");
  };

  // Logic to determine if an email is worth sending to AI
  const needsAnalysis = (email: EmailMessage): boolean => {
    // FORCE SCAN: If email is younger than 10 minutes, ALWAYS scan it.
    const emailDate = new Date(parseInt(email.internalDate));
    const now = new Date();
    const ageInMinutes = (now.getTime() - emailDate.getTime()) / 60000;
    
    if (ageInMinutes < 10) {
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
     setScanResults(prev => ({...prev, [email.id]: 'analyzing'}));

     const result = await analyzeEmailContent(email.body || email.snippet);
     
     if (result && result.hasCode) {
        setScanResults(prev => ({...prev, [email.id]: 'found'}));
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
               showToast(`Code gevonden: ${newCode.code}`);
               
               // Play Sound
               try {
                 const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');
                 audio.volume = 1.0;
                 audio.play().catch(e => console.log("Audio autoplay blocked (user inactive)", e));
               } catch (e) {
                 console.error("Audio error", e);
               }
               
               // Send Sticky Notification
               sendSystemNotification(
                 `${newCode.code} - ${newCode.serviceName}`,
                 `Klik om direct te kopiëren.`,
                 () => {
                   window.focus(); 
                   // Small delay to allow window to gain focus before clipboard write
                   setTimeout(() => {
                      navigator.clipboard.writeText(newCode.code)
                        .then(() => showToast("Gekopieerd vanaf notificatie!"))
                        .catch(err => {
                          console.error("Copy failed from notification", err);
                          showToast("Kon niet automatisch kopiëren. Klik op de kaart.");
                        });
                   }, 300);
                 }
               );
           } else {
             showToast("Code handmatig opgehaald!");
           }
           
           return [newCode, ...prev];
        });
     } else {
       setScanResults(prev => ({...prev, [email.id]: 'none'}));
       if (manual) {
         showToast("Geen code gevonden in deze e-mail.");
       }
     }
  };

  // Fetch and Analyze Logic
  const handleFetchEmails = useCallback(async () => {
    if (!accessToken) return;
    
    setIsProcessing(true);
    setAuthError(null); 

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

      for (const email of emailsToAnalyze) {
        if (needsAnalysis(email)) {
          await processEmail(email);
        } else {
          setScanResults(prev => ({...prev, [email.id]: 'skipped'}));
        }
      }

    } catch (error: any) {
      console.error("Fout tijdens ophalen:", error);
      const msg = error.message || String(error);
      
      if (msg.includes("403")) {
         if (msg.includes("API has not been used") || msg.includes("disabled")) {
             setAuthError("De Gmail API staat UIT in Google Cloud. Zet deze aan.");
         } else {
             setAuthError("Geen toegang. Log opnieuw in en vink alles aan.");
             // Token invalid, clear storage
             localStorage.removeItem('google_access_token');
             localStorage.removeItem('google_token_time');
             setAccessToken(null);
         }
      } else if (msg.includes("401")) {
         setAuthError("Sessie verlopen. Log opnieuw in.");
         setAccessToken(null);
         localStorage.removeItem('google_access_token');
         localStorage.removeItem('google_token_time');
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

  // WEB WORKER POLLING
  // Instead of a simple setInterval which browsers throttle in background tabs,
  // we use a Web Worker which runs on a separate thread and keeps timing accurate.
  useEffect(() => {
    if (accessToken) {
      // 1. Fetch immediately
      handleFetchEmails();
      
      // 2. Setup Worker
      const workerScript = `
        let intervalId = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
             if (intervalId) clearInterval(intervalId);
             // 5 seconds interval
             intervalId = setInterval(() => {
               self.postMessage('tick');
             }, 5000);
          } else if (e.data === 'stop') {
             if (intervalId) clearInterval(intervalId);
          }
        };
      `;
      
      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);

      worker.onmessage = (e) => {
        if (e.data === 'tick') {
           console.log("Worker tick - fetching emails...");
           handleFetchEmails();
        }
      };

      worker.postMessage('start');

      return () => {
        worker.postMessage('stop');
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
      };
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
                <div className="flex items-center gap-2 ml-10">
                   {accessToken ? (
                     <div className="flex items-center gap-3">
                        <span className="text-xs text-green-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                            Actief
                        </span>
                        <button onClick={handleLogout} className="text-xs text-slate-500 hover:text-red-400 underline">
                          Uitloggen
                        </button>
                     </div>
                   ) : (
                     <p className="text-xs text-slate-500">Auto-Scan Inactief</p>
                   )}
                </div>
            </div>
            {/* Minimalization Hint */}
            {accessToken && (
              <div className="mt-2 p-2 bg-blue-900/20 border border-blue-500/30 rounded text-[10px] text-blue-200">
                <p>💡 Tip: Laat dit tabblad open (of geminimaliseerd) om codes te blijven ontvangen.</p>
              </div>
            )}
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
             scanResults={scanResults}
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