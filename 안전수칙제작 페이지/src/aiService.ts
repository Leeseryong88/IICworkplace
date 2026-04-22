import { GoogleGenAI, Type } from "@google/genai";
import { PosterContent } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateSafetyCopy(context: string): Promise<Partial<PosterContent>> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `산업 안전 포스터를 위한 문구를 생성해줘. 주제 또는 상황: "${context}"
    다음의 정보를 JSON 형식으로 반환해줘:
    - mainTitle: 강렬한 메인 카피 (짧고 굵게)
    - subTitle: 부드러운 설명 카피 (안전의 가치를 강조)
    - coreActions: 3개의 핵심 수칙 (title, description 쌍으로)
    - detailedRules: 12개의 세부 수칙 (리스트 형식)
    
    디자인 톤: 기능 중심 산업 디자인, 단호하고 규율 있는 어조.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          mainTitle: { type: Type.STRING },
          subTitle: { type: Type.STRING },
          coreActions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING }
              }
            }
          },
          detailedRules: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      }
    }
  });

  const raw = JSON.parse(response.text);
  
  return {
    mainTitle: raw.mainTitle,
    subTitle: raw.subTitle,
    coreActions: raw.coreActions.map((c: any) => ({ ...c, iconName: 'AlertCircle' })), // Default icon
    detailedRules: raw.detailedRules.map((content: string, i: number) => ({ id: i + 1, content })),
  };
}

export async function recommendIcons(coreActions: { title: string, description: string }[]): Promise<string[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `다음 3가지 안전 수칙에 가장 적합한 Lucide-react 아이콘 이름을 추천해줘.
    수칙들: ${JSON.stringify(coreActions)}
    
    사용 가능한 아이콘 후보 (반드시 이 중에서만 골라줘):
    'HardHat', 'ShieldAlert', 'HandWash', 'Construction', 'Zap', 'Flame', 'Thermometer', 'Wind', 'Droplets', 'Eye', 'Stethoscope', 'Volume2', 'CigaretteOff', 'Hand', 'Siren', 'Info', 'AlertTriangle', 'Lock', 'PlugZap', 'Mask'
    
    JSON 형식으로 3개의 문자열 배열을 반환해줘.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  return JSON.parse(response.text);
}

export async function generateThemedImage(prompt: string): Promise<string | undefined> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          text: `Professional industrial safety photography/graphic, minimalist, high contrast, monochrome aesthetic. ${prompt}. High quality, clean background, suitable for poster.`,
        },
      ],
    },
    config: {
      imageConfig: {
            aspectRatio: "1:1",
        },
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return undefined;
}
