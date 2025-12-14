export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!("Notification" in window)) {
    console.log("This browser does not support desktop notification");
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }
  return false;
};

export interface NotificationResult {
  success: boolean;
  error?: string;
}

export const sendSystemNotification = async (title: string, body: string, onClick?: () => void): Promise<NotificationResult> => {
  if (!("Notification" in window)) {
    return { success: false, error: "Browser ondersteunt geen notificaties." };
  }

  if (Notification.permission !== "granted") {
    return { success: false, error: `Permissie is '${Notification.permission}' (niet 'granted')` };
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

  // 1. Try Service Worker (Preferred for Mobile)
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        // Check if active
        if (!registration.active) {
            errorLog += "[SW found but not active] ";
        } else {
            await registration.showNotification(title, options);
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

  // If we reach here, both failed
  console.error("Notification failures:", errorLog);
  return { success: false, error: errorLog.trim() };
};