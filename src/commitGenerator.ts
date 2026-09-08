import { Config } from './config';

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

export async function generateCommitMessage(diff: string, config: Config): Promise<string> {
  const prompt = config.systemPrompt.replace('{diff}', diff);

  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const body = JSON.stringify({
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    stream: false,
  });

  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body,
    });
  } catch (err) {
    throw new Error(`Failed to reach API at ${config.apiUrl}: ${(err as Error).message}`);
  }

  const json = (await response.json()) as ChatCompletionResponse;

  if (!response.ok) {
    const detail = json.error?.message ?? response.statusText;
    throw new Error(`API error ${response.status}: ${detail}`);
  }

  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('API returned an empty response. Check the model name and API URL.');
  }

  return content;
}
