// کلاینت AI نسخهٔ ۲ — هیچ کلیدی در کلاینت نیست؛ همه‌چیز از پروکسی سروری می‌گذرد.
export async function chatWithAi(prompt: string, system?: string): Promise<string> {
  const res = await fetch('/.netlify/functions/ai-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, system }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(`AI request failed: ${body.error ?? res.status}`);
  }
  const data = (await res.json()) as { text: string };
  return data.text;
}
