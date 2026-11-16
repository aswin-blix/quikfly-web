import type { QuikflyApi } from "./contract";
import { MOCK_OTP, mockApi } from "./mock";
import { httpApi } from "./http";

/** Demo mode when NEXT_PUBLIC_API_URL is empty; real backend otherwise. */
export const DEMO_MODE = !process.env.NEXT_PUBLIC_API_URL;
export const api: QuikflyApi = DEMO_MODE ? mockApi : httpApi;

/**
 * Login code to show on screen, or "" to hide the hint.
 * Mock mode always shows it; against the real API set NEXT_PUBLIC_DEMO_OTP
 * while the backend uses a fixed code instead of SMS.
 */
export const DEMO_OTP = DEMO_MODE ? MOCK_OTP : process.env.NEXT_PUBLIC_DEMO_OTP ?? "";

export { UNAUTHORIZED_EVENT } from "./http";
export type { QuikflyApi };
