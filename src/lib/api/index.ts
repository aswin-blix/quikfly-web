import type { QuikflyApi } from "./contract";
import { mockApi } from "./mock";
import { httpApi } from "./http";

/** Demo mode when NEXT_PUBLIC_API_URL is empty; real backend otherwise. */
export const DEMO_MODE = !process.env.NEXT_PUBLIC_API_URL;
export const api: QuikflyApi = DEMO_MODE ? mockApi : httpApi;
export type { QuikflyApi };
