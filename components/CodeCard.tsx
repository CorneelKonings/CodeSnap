import React, { useState } from 'react';
import { ExtractedCode } from '../types';
import { CopyIcon, CheckIcon, ShieldCheckIcon } from './Icon';

interface CodeCardProps {
  data: ExtractedCode;
}

export const CodeCard: React.FC<CodeCardProps> = ({ data }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      onClick={handleCopy}
      className="group relative bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg hover:border-cyan-500 transition-all cursor-pointer overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500"
    >
      <div className="absolute top-0 right-0 p-3 opacity-50 group-hover:opacity-100 transition-opacity">
        {copied ? (
          <div className="flex items-center gap-1 text-green-400 text-xs font-bold uppercase tracking-wider bg-slate-900/80 px-2 py-1 rounded">
            <CheckIcon className="w-4 h-4" />
            <span>Gekopieerd</span>
          </div>
        ) : (
          <CopyIcon className="w-5 h-5 text-slate-400 group-hover:text-cyan-400" />
        )}
      </div>

      <div className="flex items-start gap-4">
        <div className="bg-cyan-500/10 p-3 rounded-full shrink-0">
            <ShieldCheckIcon className="w-6 h-6 text-cyan-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wide mb-1">
            {data.serviceName}
          </h3>
          <div className="font-mono text-3xl font-bold text-white tracking-wider tabular-nums">
            {data.code}
          </div>
          <div className="mt-3 text-xs text-slate-500 truncate max-w-[200px]">
            {new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(data.timestamp)}
          </div>
        </div>
      </div>
      
      {/* Decorative Glow */}
      <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-cyan-500/20 blur-3xl rounded-full group-hover:bg-cyan-500/30 transition-all"></div>
    </div>
  );
};