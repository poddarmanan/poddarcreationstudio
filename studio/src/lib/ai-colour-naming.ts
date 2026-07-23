import Anthropic from '@anthropic-ai/sdk';
import { nearestColourName } from '@/lib/fabric-generator';

export interface ColourNameResult {
  name: string;
  confidence: number;
  source: 'vision' | 'heuristic';
}

const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/**
 * Names a fabric swatch's colour. Uses Claude vision when ANTHROPIC_API_KEY is configured;
 * otherwise falls back to a deterministic nearest-shade match against the mill's named
 * OKLCH palette, so the upload pipeline stays fully functional without a key.
 */
export async function nameColourFromImage(
  buffer: Buffer,
  mimeType: string,
  hint: { l: number; c: number; h: number }
): Promise<ColourNameResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && ALLOWED_MEDIA_TYPES.has(mimeType)) {
    try {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: buffer.toString('base64') },
              },
              {
                type: 'text',
                text: 'Name this dyed fabric swatch\'s colour with one evocative Indian textile-trade shade name (in the spirit of Neel, Gulab, Sindoor, Haldi, Kesar). Reply with strict JSON only, no prose: {"name": string, "confidence": integer 0-100}.',
              },
            ],
          },
        ],
      });
      const textBlock = response.content.find((b) => b.type === 'text');
      const raw = textBlock && 'text' in textBlock ? textBlock.text : '';
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as { name?: string; confidence?: number };
        if (parsed.name) {
          return {
            name: parsed.name,
            confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence ?? 90))),
            source: 'vision',
          };
        }
      }
    } catch (err) {
      console.error('[ai-colour-naming] vision call failed, falling back to heuristic:', err);
    }
  }

  const nearest = nearestColourName(hint.l, hint.c, hint.h);
  const confidence = Math.max(70, Math.min(99, Math.round(99 - nearest.distance)));
  return { name: nearest.name, confidence, source: 'heuristic' };
}
