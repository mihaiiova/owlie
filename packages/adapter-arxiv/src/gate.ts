import { RequestGate } from '@owlieio/core';

export { RequestGate, sleep } from '@owlieio/core';

/** API spacing required by the arXiv API terms of use. */
export const ARXIV_API_INTERVAL_MS = 3_000;

/** One gate per process, shared by every adapter instance. */
export const sharedArxivApiGate = new RequestGate(ARXIV_API_INTERVAL_MS);
