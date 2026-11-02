export {};

declare global {
  interface GoogleCodeResponse {
    code?: string;
    error?: string;
  }

  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: any) => void;
          prompt: () => void;
          renderButton: (el: HTMLElement, config: any) => void;
        };
        oauth2?: {
          initCodeClient: (config: {
            client_id: string;
            scope: string;
            ux_mode?: "popup" | "redirect";
            callback: (response: GoogleCodeResponse) => void;
          }) => { requestCode: () => void };
        };
      };
    };
  }
}
