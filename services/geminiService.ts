import { GoogleGenAI, Type, Schema } from "@google/genai";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    hasCode: {
      type: Type.BOOLEAN,
      description: "True if the text contains a 2FA, OTP, or verification code.",
    },
    serviceName: {
      type: Type.STRING,
      description: "The name of the website or service sending the code (e.g., Google, Amazon, Facebook).",
    },
    code: {
      type: Type.STRING,
      description: "The actual verification code sequence found.",
    },
  },
  required: ["hasCode"],
};

export const analyzeEmailContent = async (emailBody: string) => {
  if (!apiKey) {
    throw new Error("API Key missing");
  }

  // Increased limit to 8000 to catch codes at the bottom of long threads/newsletters
  const truncatedBody = emailBody.substring(0, 8000);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Analyze the following email text carefully. Search for login codes, 2FA codes, OTPs, or verification numbers.
      
      Rules:
      1. Look for 4-8 digit numbers (e.g., 123456, 123 456, 123-456).
      2. Look for Alphanumeric codes often used by games or services (e.g., Steam Guard: R5T21, Sony: A1B2C3).
      3. Ignore dates, phone numbers, or order numbers unless explicitly labeled as a verification code.
      4. If multiple candidates exist, pick the one labeled "code" or "pin".
      
      Email Body:
      """
      ${truncatedBody}
      """`,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        // Temperature 0 ensures consistency
        temperature: 0, 
      },
    });

    const jsonText = response.text;
    if (!jsonText) return null;

    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return null; 
  }
};