export {};

type PayPalButtonsActions = { restart: () => Promise<void> | void };

type PayPalButtonsInstance = {
  render: (element: HTMLElement) => Promise<void>;
  close: () => Promise<void> | void;
};

declare global {
  interface Window {
    paypal?: {
      Buttons: (options: {
        style?: { layout?: "vertical" | "horizontal"; label?: "paypal"; shape?: "rect"; color?: "gold" };
        createOrder: () => Promise<string>;
        onApprove: (data: { orderID: string }, actions: PayPalButtonsActions) => Promise<void>;
        onCancel?: () => void;
        onError?: (error: unknown) => void;
      }) => PayPalButtonsInstance;
    };
  }
}
