import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateViewerComments = async (context: string): Promise<string[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `你正在扮演直播间的观众群体（类似抖音/TikTok风格）。
      主播刚刚说了一句话或做了一个动作: "${context}"。
      
      请生成 5-8 条简短、真实、反应迅速的观众弹幕来回应主播。
      
      要求：
      1. 口语化，使用网络流行语（中文）。
      2. 包含表情符号 (emojis)。
      3. 风格多样：有的夸赞，有的提问，有的仅仅是凑热闹（如"666", "哈哈"）。
      4. 如果主播在欢迎人，就回复"主播好"；如果主播在求赞，就回复"已赞"。
      
      请只返回一个纯 JSON 字符串数组，不要包含 Markdown 格式。`,
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
    if (!text) return ["666", "主播好", "来了来了", "哈哈哈", "真不错"];
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Error generating comments:", error);
    return ["666", "主播好", "支持支持", "卡了吗？", "爱了爱了"];
  }
};