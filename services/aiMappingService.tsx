import { GoogleGenAI, Type } from "@google/genai";
import { ShapeKeyMapping } from "../types";
import { VISEMES_LIST } from "../constants";

/**
 * Uses Gemini AI to intelligently map mesh shape keys to abstract visemes.
 * This replaces hard-coded string matching with semantic reasoning.
 */
export const generateAIMapping = async (
  shapeKeys: string[],
  onProgress: (msg: string) => void
): Promise<ShapeKeyMapping> => {
  
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }

  onProgress("Analyzing shape keys with AI...");
  
  const ai = new GoogleGenAI({ apiKey });

  // Build the viseme reference list for the AI
  const visemeReference = VISEMES_LIST.map(v => ({
    id: v.id,
    label: v.label,
    description: v.description,
    phonemes: v.aliases?.join(", ") || ""
  }));

  const prompt = `
You are an expert 3D animator specializing in facial rigging and lip sync.

I have a 3D character mesh with the following Shape Keys (morph targets):
${shapeKeys.map((key, i) => `${i + 1}. "${key}"`).join('\n')}

I need to map these shape keys to standard Viseme codes used in lip sync animation.

Here are the 15 standard Visemes with their meanings:
${visemeReference.map(v => `- ${v.id.toUpperCase()}: ${v.label} (${v.description}) - Phonemes: ${v.phonemes}`).join('\n')}

Task:
For each Viseme ID, determine which Shape Key (if any) best represents that mouth shape.

Rules:
1. Use semantic understanding, not just string matching. For example:
   - "Jaw_Open" or "mouth_wide" should map to "aa" (Wide Open)
   - "Lips_Closed" or "m_sound" should map to "pp" (Lips Closed)
   - "mouth_smile" is NOT a viseme, skip it
2. If multiple keys could work, choose the one most specific to speech (not emotions like smile/frown)
3. If no suitable key exists for a viseme, return an empty string "".
4. Shape key names may be in any language, use context clues
5. Consider common abbreviations (e.g., "MO" = Mouth Open, "LC" = Lips Closed)

Output Format:
Return a JSON object where:
- Keys are viseme IDs (lowercase): "sil", "pp", "ff", "th", "dd", "kk", "ch", "ss", "nn", "rr", "aa", "e", "i", "o", "u"
- Values are the exact shape key name (case-sensitive string) or empty string "" if none.

Example output structure:
{
  "sil": "",
  "pp": "Lips_Closed",
  "aa": "Jaw_Open",
  "e": "Mouth_E",
  ...
}
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview", 
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sil: { type: Type.STRING },
          pp: { type: Type.STRING },
          ff: { type: Type.STRING },
          th: { type: Type.STRING },
          dd: { type: Type.STRING },
          kk: { type: Type.STRING },
          ch: { type: Type.STRING },
          ss: { type: Type.STRING },
          nn: { type: Type.STRING },
          rr: { type: Type.STRING },
          aa: { type: Type.STRING },
          e: { type: Type.STRING },
          i: { type: Type.STRING },
          o: { type: Type.STRING },
          u: { type: Type.STRING }
        },
        required: ["sil", "pp", "ff", "th", "dd", "kk", "ch", "ss", "nn", "rr", "aa", "e", "i", "o", "u"]
      },
      // FIXED: Use thinkingBudget instead of invalid parameters
      thinkingConfig: {
        thinkingBudget: 2048
      }
    }
  });

  onProgress("Parsing AI mapping...");
  
  const text = response.text;
  if (!text) {
    throw new Error("No response from AI.");
  }

  try {
    const rawMapping = JSON.parse(text);
    
    // Validate that returned keys actually exist in the mesh
    const validMapping: ShapeKeyMapping = {};
    Object.entries(rawMapping).forEach(([visemeId, shapeKey]) => {
      const keyStr = shapeKey as string;
      if (keyStr && keyStr.length > 0 && shapeKeys.includes(keyStr)) {
        validMapping[visemeId] = keyStr;
      } else {
        // Handle empty string or invalid keys as null
        if (keyStr && keyStr.length > 0) {
            console.warn(`AI suggested "${keyStr}" for ${visemeId}, but it doesn't exist in mesh. Ignoring.`);
        }
        validMapping[visemeId] = null;
      }
    });

    return validMapping;
  } catch (e) {
    console.error("Failed to parse AI mapping", e);
    throw new Error("AI response was not valid JSON.");
  }
};