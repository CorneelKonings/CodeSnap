import { EmailMessage } from '../types';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';

let tokenClient: any;
let accessToken: string | null = null;

// Helper to decode Gmail's URL-safe Base64
const decodeBase64 = (data: string) => {
  try {
    return atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  } catch (e) {
    console.error("Base64 decode error", e);
    return "";
  }
};

// Helper to clean text (strip HTML tags and decode common entities)
const cleanText = (text: string): string => {
  return text
    .replace(/<[^>]*>?/gm, ' ') // Remove HTML tags
    .replace(/&nbsp;/g, ' ')    // Replace non-breaking space
    .replace(/&amp;/g, '&')     // Replace &
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')       // Collapse multiple spaces
    .trim();
};

// Recursive function to extract text from complex email structures
const extractBodyFromPayload = (payload: any): string => {
  if (!payload) return "";

  // 1. If strictly plain text part found
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return decodeBase64(payload.body.data);
  }

  // 2. If it has parts (Multipart), search through them
  if (payload.parts) {
    // Priority 1: Look for plain text explicitly
    const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (textPart) {
      return extractBodyFromPayload(textPart);
    }

    // Priority 2: Look for HTML if no text
    const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
    if (htmlPart) {
      const rawHtml = extractBodyFromPayload(htmlPart);
      return cleanText(rawHtml);
    }

    // Priority 3: Recursively check all parts (nested multiparts)
    return payload.parts.map((p: any) => extractBodyFromPayload(p)).join('\n');
  }

  // 3. Fallback: Check body directly if no parts (often happens in simple HTML emails)
  if (payload.body && payload.body.data) {
    const content = decodeBase64(payload.body.data);
    if (payload.mimeType === 'text/html') {
       return cleanText(content);
    }
    return content;
  }

  return "";
};

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
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    console.error("Token client not initialized.");
    alert("Google authenticatie is niet geladen. Herlaad de pagina.");
  }
};

export const fetchRecentEmails = async (token: string): Promise<EmailMessage[]> => {
  try {
    // UPDATED QUERY: Look in Inbox OR Updates OR Promotions to find hidden codes
    const listResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=label:inbox OR category:updates OR category:promotions&maxResults=20',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    if (!listResponse.ok) {
        throw new Error(`Failed to list messages: ${listResponse.status}`);
    }
    const listData = await listResponse.json();
    
    if (!listData.messages || listData.messages.length === 0) return [];

    const emails: EmailMessage[] = await Promise.all(
      listData.messages.map(async (msg: any) => {
        const detailResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const detail = await detailResponse.json();
        
        const headers = detail.payload.headers;
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(No Subject)';
        const sender = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
        
        // Use the new robust extraction logic
        let body = extractBodyFromPayload(detail.payload);
        
        // Final fallback to snippet if body extraction failed completely
        if (!body || body.trim().length === 0) {
          body = detail.snippet;
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