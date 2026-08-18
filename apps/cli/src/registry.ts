import { YouTubeAdapter } from '@owlieio/adapter-youtube';
import { PodcastAdapter } from '@owlieio/adapter-podcast';
import { RssAdapter } from '@owlieio/adapter-rss';
import { RedditAdapter } from '@owlieio/adapter-reddit';
import { OpenAIProcessor } from '@owlieio/provider-openai';
import { WhisperLocalTranscriber } from '@owlieio/provider-whisper';

/**
 * The adapters and providers bundled into the `owlie` package. Importing the
 * classes here ensures they are included in the self-contained build and gives
 * `owlie doctor` something concrete to report.
 */
export const ADAPTER_IDS: readonly string[] = [
  YouTubeAdapter.id,
  PodcastAdapter.id,
  RssAdapter.id,
  RedditAdapter.id,
];

export const PROVIDER_IDS: readonly string[] = [OpenAIProcessor.id, WhisperLocalTranscriber.id];
