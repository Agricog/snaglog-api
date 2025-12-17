import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function analyzeSnagPhoto(imageUrl) {
  try {
    // Fetch the image from R2
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString('base64');
    
    // Determine media type from URL or default to jpeg
    let mediaType = 'image/jpeg';
    if (imageUrl.includes('.png')) mediaType = 'image/png';
    else if (imageUrl.includes('.webp')) mediaType = 'image/webp';
    else if (imageUrl.includes('.gif')) mediaType = 'image/gif';

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: `You are a UK building inspector analyzing a photo of a defect in a new build property.

Analyze this image and provide:
1. defectType - Brief name of the defect (e.g., "Paint scuff", "Cracked tile", "Gap in sealant")
2. description - One sentence describing the issue
3. severity - One of: MINOR, MODERATE, or MAJOR
4. suggestedTrade - Which trade should fix this (e.g., "Decorator", "Tiler", "Plumber", "Electrician", "Joiner", "Plasterer")
5. remedialAction - Brief description of how to fix it
6. confidence - Your confidence in this assessment from 0.0 to 1.0

Respond ONLY with valid JSON in this exact format:
{
  "defectType": "string",
  "description": "string", 
  "severity": "MINOR|MODERATE|MAJOR",
  "suggestedTrade": "string",
  "remedialAction": "string",
  "confidence": 0.0
}`,
            },
          ],
        },
      ],
    });

    const text = message.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No valid JSON in response');
  } catch (error) {
    console.error('Claude analysis error:', error.message);
    return {
      defectType: 'Unidentified defect',
      description: 'Unable to analyze image automatically',
      severity: 'MINOR',
      suggestedTrade: 'General',
      remedialAction: 'Manual inspection required',
      confidence: 0,
    };
  }
}

export default { analyzeSnagPhoto };
