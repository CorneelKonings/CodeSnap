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

export const sendSystemNotification = async (title: string, body: string, onClick?: () => void) => {
  if (Notification.permission !== "granted") {
    console.warn("Notification permission not granted");
    return false;
  }

  const options: any = {
    body,
    icon: 'https://vitejs.dev/logo.svg',
    badge: 'https://vitejs.dev/logo.svg', // Android small icon
    vibrate: [200, 100, 200],
    tag: 'codesnap-otp',
    renotify: true,
    requireInteraction: true,
    data: { url: window.location.href } // Data for SW to use
  };

  try {
    // 1. Try Service Worker (Best for Mobile/PWA)
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return true;
    } 
    
    // 2. Fallback to Standard Web API (Desktop)
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
    return true;

  } catch (error) {
    console.error("Notification failed:", error);
    // Fallback alert if everything fails, so user knows it tried
    // alert(`NIEUWE CODE: ${title}\n${body}`); 
    return false;
  }
};