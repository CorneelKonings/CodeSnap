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

export const sendSystemNotification = (title: string, body: string, onClick?: () => void) => {
  if (Notification.permission === "granted") {
    // Check if service worker is ready (for PWA capabilities) or fall back to standard notification
    
    const options: any = {
      body,
      icon: 'https://vitejs.dev/logo.svg', // App Icon
      badge: 'https://vitejs.dev/logo.svg', // Small badge for Android bar
      vibrate: [200, 100, 200], // Vibrate pattern
      tag: 'codesnap-otp', // Prevents stacking too many notifications
      renotify: true, // Play sound/vibrate again even if one is already open
      requireInteraction: true, // CRITICAL: Keeps notification on screen until user interacts
      silent: false
    };

    const notification = new Notification(title, options);

    if (onClick) {
      notification.onclick = (e) => {
        e.preventDefault();
        // Attempt to focus the window
        window.focus(); 
        if (window.opener) window.opener.focus();
        
        onClick();
        notification.close();
      };
    }
  }
};