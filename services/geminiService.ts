import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateViewerComments = async (context: string): Promise<string[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `生成5条简短、真实、积极的直播间观众评论，关于: "${context}"。
      保持口语化，像抖音直播间的弹幕风格。
      包含表情符号 (emojis)。
      只返回一个 JSON 字符串数组。`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.ARRAY,
            items: {
                type: Type.STRING
            }
        }
      }
    });

    const text = response.text;
    if (!text) return ["哇！😍", "主播好棒！", "前排围观", "666 🔥", "爱了爱了"];
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Error generating comments:", error);
    return ["哇！😍", "主播好棒！", "前排围观", "666 🔥", "爱了爱了"];
  }
};