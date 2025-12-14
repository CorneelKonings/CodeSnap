export const requestNotificationPermission = async (): Promise<boolean> => {
  // Try requesting even if it says it's missing (webview quirks)
  try {
      if (!("Notification" in window)) {
        console.warn("Notification object missing, skipping requestPermission");
      } else {
        if (Notification.permission !== "granted") {
            const permission = await Notification.requestPermission();
            return permission === "granted";
        }
      }
  } catch (e) {
      console.error("Forced request permission failed", e);
  }
  return true;
};

export interface NotificationResult {
  success: boolean;
  error?: string;
}

export const sendSystemNotification = async (title: string, body: string, onClick?: () => void): Promise<NotificationResult> => {
  // We skip the check if !("Notification" in window) to force execution flow down to Service Worker
  // which might exist independently in some PWA contexts.

  const options: any = {
    body,
    icon: 'https://vitejs.dev/logo.svg',
    badge: 'https://vitejs.dev/logo.svg',
    vibrate: [200, 100, 200],
    tag: 'codesnap-otp',
    renotify: true,
    requireInteraction: true,
    data: { url: window.location.href }
  };

  let errorLog = "";
  let swSuccess = false;

  // 1. Try Service Worker (Preferred/Forced)
  try {
    if ('serviceWorker' in navigator) {
      // We try to get registration. If it exists, we use it. 
      // Note: We don't check for 'active' state strictly, we just try to call showNotification.
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
         try {
            await registration.showNotification(title, options);
            swSuccess = true;
            return { success: true };
         } catch (swErr: any) {
             errorLog += `[SW showNotification failed: ${swErr.message}] `;
         }
      } else {
        errorLog += "[No SW registration] ";
      }
    } else {
        errorLog += "[No navigator.serviceWorker] ";
    }
  } catch (e: any) {
    errorLog += `[SW Access Error: ${e.message || e}] `;
  }

  // 2. Fallback to Standard Web API (Forced)
  if (!swSuccess) {
      try {
        // We construct the object even if permission is 'denied' in the hope that it's a false flag
        const notification = new Notification(title, options);
        
        if (onClick) {
          notification.onclick = (e) => {
            e.preventDefault();
            window.focus();
            if (window.opener) window.opener.focus();
            onClick();
            notification.close();
          };
        }
        return { success: true };
      } catch (e: any) {
        errorLog += `[Standard Error: ${e.message || e}]`;
      }
  }

  // If we reach here, both failed
  console.error("Notification forced attempts failed:", errorLog);
  return { success: false, error: errorLog.trim() };
};