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
    const notification = new Notification(title, {
      body,
    });

    if (onClick) {
      notification.onclick = (e) => {
        e.preventDefault();
        onClick();
        notification.close();
      };
    }
  }
};