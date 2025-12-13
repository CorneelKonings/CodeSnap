export interface ExtractedCode {
  id: string;
  serviceName: string;
  code: string;
  timestamp: Date;
  rawEmailPreview: string;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  sender: string;
  snippet: string;
  body: string; // The full text content
  internalDate: string;
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  FOUND = 'FOUND',
  NO_CODE = 'NO_CODE',
  ERROR = 'ERROR'
}