import { EmailMessage } from '../types';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';

let tokenClient: any;
let accessToken: string | null = null;

export const initGoogleAuth = (
  onTokenReceived: (token: string) => void,
  onError?: (error: any) => void
) => {
  if (!CLIENT_ID) {
    console.warn("GOOGLE_CLIENT_ID is missing from environment variables.");
    return false;
  }

  // @ts-ignore
  if (window.google) {
    try {
      // @ts-ignore
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response: any) => {
          if (response.error) {
            console.error("Auth Error (Callback):", response);
            if (onError) onError(response);
            return;
          }
          if (response.access_token) {
            accessToken = response.access_token;
            onTokenReceived(response.access_token);
          }
        },
        error_callback: (error: any) => {
          console.error("Auth Error (Error Callback):", error);
          if (onError) onError(error);
        }
      });
      return true;
    } catch (e) {
      console.error("Failed to initialize token client:", e);
      if (onError) onError(e);
      return false;
    }
  }
  return false;
};

export const signIn = () => {
  if (tokenClient) {
    // Force prompt to ensure we don't get stuck in a loop of silent failures if origin is wrong
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    console.error("Token client not initialized. Check internet or Client ID.");
    alert("Google authenticatie is niet geladen. Controleer je internetverbinding of herlaad de pagina.");
  }
};

export const fetchRecentEmails = async (token: string): Promise<EmailMessage[]> => {
  try {
    // 1. List messages (Inbox only, increased to 20 for better scanning)
    const listResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=label:inbox&maxResults=20',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    if (!listResponse.ok) {
        const errorData = await listResponse.json().catch(() => ({}));
        throw new Error(`Failed to list messages: ${listResponse.status} ${JSON.stringify(errorData)}`);
    }
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