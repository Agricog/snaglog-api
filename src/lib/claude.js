import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function analyzeSnagPhoto(imageUrl) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'url',
              url: imageUrl,
            },
          },
          {
            type: 'text',
            text: `You are an expert UK building inspector analyzing a photo of a defect in a new build property.

Analyze this image and provide a JSON response with the following fields:
- defectType: Brief category (e.g., "Paint defect", "Joinery issue", "Plumbing problem", "Electrical issue", "Tiling defect", "Plastering issue", "Window/door issue", "Flooring defect", "Sealant issue", "Fitting damage")
- description: Clear, professional description of the defect (2-3 sentences max)
- severity: One of "MINOR", "MODERATE", or "MAJOR"
- suggestedTrade: The trade responsible (e.g., "Decorator", "Joiner", "Plumber", "Electrician", "Tiler", "Plasterer", "Builder")
- remedialAction: Brief recommended fix (1 sentence)
- confidence: Your confidence level 0.0 to 1.0

If the image does not show a clear defect, still provide your best assessment.

Respond ONLY with valid JSON, no other text.`,
          },
        ],
      },
    ],
  });

  try {
    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No JSON found in response');
  } catch (error) {
    console.error('Error parsing Claude response:', error);
    return {
      defectType: 'Unidentified defect',
      description: 'Unable to analyze this image. Please review manually.',
      severity: 'MINOR',
      suggestedTrade: 'Builder',
      remedialAction: 'Manual inspection required',
      confidence: 0.0,
    };
  }
}

export default anthropic;
