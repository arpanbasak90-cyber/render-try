/// <reference types="vite/client" />

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; auto_select?: boolean; context?: string; callback: (response: { credential: string }) => void }) => void
          renderButton: (element: HTMLElement, options: Record<string, string | number>) => void
        }
      }
    }
  }
}

export {}
