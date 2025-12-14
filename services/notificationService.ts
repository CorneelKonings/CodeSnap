export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
      if (!("Notification" in window)) {
        console.warn("Notification API not supported");
        return false;
      }
      
      if (Notification.permission !== "granted") {
          const permission = await Notification.requestPermission();
          return permission === "granted";
      }
      
      return true;
  } catch (e) {
      console.error("Permission request error:", e);
      return false;
  }
};

export interface NotificationResult {
  success: boolean;
  error?: string;
}

export const sendSystemNotification = async (title: string, body: string, onClick?: () => void): Promise<NotificationResult> => {
  const options: any = {
    body,
    icon: '/vite.svg', // Use local icon if possible, or fallback to external
    vibrate: [200, 100, 200],
    tag: 'codesnap-otp-' + Date.now(), // Unique tag to ensure every code triggers a new alert
    renotify: true,
    requireInteraction: true,
    data: { url: window.location.href }
  };

  let errorLog = "";

  // STRATEGY 1: Service Worker (The only reliable way on Android/Mobile)
  try {
    if ('serviceWorker' in navigator) {
      // Wait for the service worker to be fully active and ready
      const registration = await navigator.serviceWorker.ready;
      
      if (registration && registration.active) {
         try {
            await registration.showNotification(title, options);
            return { success: true };
         } catch (swErr: any) {
             console.error("SW showNotification failed:", swErr);
             errorLog += `[SW Error: ${swErr.message}] `;
         }
      } else {
        errorLog += "[SW not ready] ";
      }
    }
  } catch (e: any) {
    errorLog += `[SW Access Error: ${e.message}] `;
  }

  // STRATEGY 2: Desktop Fallback (new Notification)
  // Only works reliably on Desktop Chrome/Firefox/Safari
  try {
    const notification = new Notification(title, options);
    
    if (onClick) {
      notification.onclick = (e) => {
        e.preventDefault();
        window.focus();
        onClick();
        notification.close();
      };
    }
    return { success: true };
  } catch (e: any) {
    errorLog += `[Standard API Error: ${e.message}]`;
  }

  console.error("All notification strategies failed:", errorLog);
  return { success: false, error: errorLog.trim() };
};