import { zebraApi } from '../electron/preload';

declare global {
  interface Window {
    zebra: typeof zebraApi;
  }
}
