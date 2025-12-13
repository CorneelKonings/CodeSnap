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

  // Truncate email body to avoid massive payloads (first 2000 chars is usually enough for OTP)
  const truncatedBody = emailBody.substring(0, 2000);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Analyze the following email text. If it contains a login code, verification code, or OTP, extract it. 
      
      Email Body:
      """
      ${truncatedBody}
      """`,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: "You are a specialized security agent. Your job is to extract 2FA codes, OTPs, and verification numbers from emails accurately.",
        temperature: 0.1, 
      },
    });

    const jsonText = response.text;
    if (!jsonText) return null;

    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    // Don't throw, just return null so the app doesn't crash on one bad email
    return null; 
  }
};