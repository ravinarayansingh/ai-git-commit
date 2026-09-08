import { Config } from './config';
import { runAgent } from './agentProvider';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string };
  }>;
  error?: { message: string };
}

const REQUEST_TIMEOUT_MS = 60_000;

/** Remove markdown fences and surrounding quotes that LLMs often wrap output in. */
export function cleanMessage(raw: string): string {
  let text = raw.trim();
  const fenced = text.match(/^```[a-zA-Z]*\n?([\s\S]*?)\n?```$/);
  if (fenced) {
    text = fenced[1].trim();
  }
  const quoted = text.match(/^(["'])([\s\S]*)\1$/);
  if (quoted) {
    text = quoted[2].trim();
  }
  return text;
}

export async function generateCommitMessage(
  diff: string,
  config: Config,
  apiKey: string | undefined,
  signal?: AbortSignal,
  conventionInstruction?: string
): Promise<string> {
  const convention = conventionInstruction ? `\n\n${conventionInstruction}` : '';

  if (config.provider !== 'api') {
    // Agent CLIs get one combined prompt on stdin. Use a function replacer so
    // `$&` etc. in the diff are not treated as patterns.
    const base = config.systemPrompt.includes('{diff}')
      ? config.systemPrompt.replace('{diff}', () => diff)
      : `${config.systemPrompt}\n\nDiff:\n${diff}`;
    const prompt = `${base}${convention}\n\nOutput ONLY the commit message text — no preamble, no explanation, no markdown fences.`;
    return cleanMessage(await runAgent(config.provider, prompt, config, signal));
  }

  // Split the template into instructions (system) and the diff (user). Use a
  // function replacer so `$&` etc. in the diff are not treated as patterns.
  let messages: ChatMessage[];
  if (config.systemPrompt.includes('{diff}')) {
    const instructions = config.systemPrompt.replace('{diff}', () => '').trim();
    messages = [
      { role: 'system', content: `${instructions}${convention}` },
      { role: 'user', content: diff },
    ];
  } else {
    messages = [
      { role: 'system', content: `${config.systemPrompt}${convention}` },
      { role: 'user', content: `Diff:\n${diff}` },
    ];
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const body = JSON.stringify({
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    stream: false,
  });

  // Combine caller cancellation with a timeout manually — AbortSignal.any
  // needs Node 20+, but VS Code 1.85 still runs on Node 18.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
  } catch (err) {
    if (signal?.aborted) {
      throw err; // user cancellation, handled by the caller
    }
    if (timedOut) {
      throw new Error(`Request to ${config.apiUrl} timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`);
    }
    throw new Error(`Failed to reach API at ${config.apiUrl}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  if (!response.ok) {
    // The error body may be JSON or an HTML/plain-text page from a proxy.
    let detail = response.statusText;
    const text = await response.text().catch(() => '');
    try {
      const parsed = JSON.parse(text) as ChatCompletionResponse;
      detail = parsed.error?.message ?? detail;
    } catch {
      // not JSON — keep statusText
    }
    throw new Error(`API error ${response.status}: ${detail}`);
  }

  const json = (await response.json()) as ChatCompletionResponse;
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('API returned an empty response. Check the model name and API URL.');
  }

  return cleanMessage(content);
}
