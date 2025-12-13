import { EmailMessage } from '../types';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';

let tokenClient: any;
let accessToken: string | null = null;

export const initGoogleAuth = (onTokenReceived: (token: string) => void) => {
  if (!CLIENT_ID) {
    console.warn("GOOGLE_CLIENT_ID is missing from environment variables.");
    return false;
  }

  // @ts-ignore
  if (window.google) {
    // @ts-ignore
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response: any) => {
        if (response.access_token) {
          accessToken = response.access_token;
          onTokenReceived(response.access_token);
        }
      },
    });
    return true;
  }
  return false;
};

export const signIn = () => {
  if (tokenClient) {
    tokenClient.requestAccessToken();
  } else {
    console.error("Token client not initialized. Check internet or Client ID.");
  }
};

export const fetchRecentEmails = async (token: string): Promise<EmailMessage[]> => {
  try {
    // 1. List messages (Inbox only, max 5)
    const listResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=label:inbox&maxResults=5',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    if (!listResponse.ok) throw new Error("Failed to list messages");
    const listData = await listResponse.json();
    
    if (!listData.messages || listData.messages.length === 0) return [];

    // 2. Fetch details for each message
    const emails: EmailMessage[] = await Promise.all(
      listData.messages.map(async (msg: any) => {
        const detailResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const detail = await detailResponse.json();
        
        // Extract headers
        const headers = detail.payload.headers;
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(No Subject)';
        const sender = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
        
        // decode body (simplified logic for text/plain)
        let body = detail.snippet; // Fallback
        if (detail.payload.parts) {
          const textPart = detail.payload.parts.find((p: any) => p.mimeType === 'text/plain');
          if (textPart && textPart.body.data) {
             body = atob(textPart.body.data.replace(/-/g, '+').replace(/_/g, '/'));
          }
        } else if (detail.payload.body && detail.payload.body.data) {
           body = atob(detail.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        }

        return {
          id: detail.id,
          threadId: detail.threadId,
          subject,
          sender,
          snippet: detail.snippet,
          body,
          internalDate: detail.internalDate
        };
      })
    );

    return emails;
  } catch (error) {
    console.error("Error fetching emails:", error);
    throw error;
  }
};