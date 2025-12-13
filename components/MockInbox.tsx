import React from 'react';
import { EmailMessage } from '../types';
import { MailIcon, RefreshCwIcon } from './Icon';

interface InboxProps {
  emails: EmailMessage[];
  onRefresh: () => void;
  onConnect: () => void;
  isConnected: boolean;
  isProcessing: boolean;
}

export const Inbox: React.FC<InboxProps> = ({ emails, onRefresh, onConnect, isConnected, isProcessing }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl h-full flex flex-col overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <h2 className="text-slate-200 font-semibold flex items-center gap-2">
          <MailIcon className="w-5 h-5 text-slate-400" />
          {isConnected ? 'Gmail Inbox' : 'Inbox'}
        </h2>
        
        {!isConnected ? (
          <button
            onClick={onConnect}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
          >
            Verbind Gmail
          </button>
        ) : (
          <button
            onClick={onRefresh}
            disabled={isProcessing}
            className={`p-2 rounded-lg transition-all ${
              isProcessing
                ? 'bg-slate-800 text-slate-600 animate-spin'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <RefreshCwIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {!isConnected ? (
          <div className="h-60 flex flex-col items-center justify-center text-slate-500 text-sm p-4 text-center">
             <p className="mb-2">Log in om je e-mails te scannen.</p>
             <p className="text-xs opacity-50 max-w-[200px]">We lezen alleen je inbox om verificatiecodes te vinden. Gegevens worden niet opgeslagen.</p>
          </div>
        ) : emails.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-slate-500 text-sm">
            <p>Geen recente e-mails.</p>
            <p className="text-xs opacity-60">Druk op refresh om te scannen.</p>
          </div>
        ) : (
          emails.map((email) => (
            <div key={email.id} className="p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-colors cursor-default group">
              <div className="flex justify-between items-start mb-1">
                <span className="font-semibold text-slate-200 text-sm truncate max-w-[120px]">{email.sender.split('<')[0]}</span>
                <span className="text-xs text-slate-500">
                  {new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' }).format(new Date(parseInt(email.internalDate)))}
                </span>
              </div>
              <div className="text-sm font-medium text-slate-300 mb-1 truncate">{email.subject}</div>
              <div className="text-xs text-slate-500 line-clamp-2 group-hover:text-slate-400 transition-colors">{email.snippet}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};