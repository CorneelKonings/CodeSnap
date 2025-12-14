export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!("Notification" in window)) {
    console.log("This browser does not support desktop notification");
    return false;
  }

  // Always request if not granted, to be safe
  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }
  return true;
};

export interface NotificationResult {
  success: boolean;
  error?: string;
}

export const sendSystemNotification = async (title: string, body: string, onClick?: () => void): Promise<NotificationResult> => {
  if (!("Notification" in window)) {
    return { success: false, error: "Browser ondersteunt geen notificaties." };
  }

  // REMOVED: The strict check blocking 'denied' status. 
  // We now try to send regardless. If it's truly denied, the browser will throw an error in the try/catch blocks below.
  // This fixes the issue where the app thinks it's denied (stale state) but the user actually granted it.
  
  if (Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch (e) {
        console.warn("Auto-request permission failed", e);
      }
  }

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

  // 1. Try Service Worker (Preferred for Mobile/PWA)
  // Even if window.Notification.permission says denied, SW might have independent access on some Android versions.
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        if (!registration.active) {
            errorLog += "[SW found but not active] ";
        } else {
            // Trying to show notification via SW
            await registration.showNotification(title, options);
            swSuccess = true;
            return { success: true };
        }
      } else {
        errorLog += "[No SW registration found] ";
      }
    } else {
        errorLog += "[No SW support] ";
    }
  } catch (e: any) {
    errorLog += `[SW Error: ${e.message || e}] `;
  }

  // 2. Fallback to Standard Web API
  if (!swSuccess) {
      try {
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
  console.error("Notification failures:", errorLog);
  return { success: false, error: errorLog.trim() };
};