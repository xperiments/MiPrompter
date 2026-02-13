import React from "react";

export function useWindowMessages(onMessage: (m: any) => void) {
  React.useEffect(() => {
    const handler = (e: MessageEvent) => onMessage(e.data);
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onMessage]);
}
    