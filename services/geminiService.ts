
import { GoogleGenAI, Type } from "@google/genai";
import { AccountAnalysis } from "../types.ts";

// Note: In browser environments, process.env.API_KEY is usually injected at build time 
// or available globally. We use a fallback to prevent immediate crashes.
const apiKey = typeof process !== 'undefined' ? process.env.API_KEY : '';
const ai = new GoogleGenAI({ apiKey: apiKey || '' });

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    contacts: {
      type: Type.ARRAY,
      description: "Stakeholder mapping. Crucial: Infer seniority from titles. VPs should be peers to VPs, Directors to Directors.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          title: { type: Type.STRING },
          managerId: { type: Type.STRING, description: "ID of manager. If unknown, leave null or infer from title seniority (e.g. Manager reports to Director)." },
          department: { type: Type.STRING },
          buyingRole: { 
            type: Type.STRING, 
            description: "Decision Maker, Technical Influencer, Internal Advocate, or User." 
          },
          strategicAction: { type: Type.STRING },
          powerLevel: { type: Type.STRING },
          stance: { type: Type.STRING },
          alignmentRisk: { type: Type.STRING },
          seniorityRank: { 
            type: Type.INTEGER, 
            description: "Rank 1-10. 1=CEO/Pres, 2=SVP/EVP, 3=VP, 4=Director, 5=Manager, 6=IC." 
          }
        },
        required: ["id", "name", "title", "buyingRole", "strategicAction", "stance", "department", "powerLevel", "seniorityRank"]
      }
    },
    accountName: { type: Type.STRING },
    executiveSummary: { type: Type.STRING },
    criticalAlignmentGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
    strategicWins: { type: Type.ARRAY, items: { type: Type.STRING } }
  },
  required: ["contacts", "accountName", "executiveSummary", "criticalAlignmentGaps", "strategicWins"]
};

export const analyzeAccountDocument = async (text: string): Promise<AccountAnalysis> => {
  const model = "gemini-3-pro-preview";
  const prompt = `
    TASK: Build a high-fidelity organizational hierarchy and stakeholder analysis.
    
    HIERARCHY LOGIC:
    1. TITLE PARITY: Titles like "VP", "Vice President", "SVP" are senior leadership. They should not report to Directors or Managers.
    2. INFERENCE: If reporting lines aren't explicit, use seniorityRank to build a logical tree. Lower ranks report to higher ranks within the same department.
    3. DUPLICATES: If "Ken" appears in two docs with different details, merge him into one entity.

    INPUT DATA:
    """
    ${text}
    """
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA as any,
      temperature: 0,
      thinkingConfig: { thinkingBudget: 4000 }
    }
  });

  try {
    const parsed = JSON.parse(response.text || "{}") as AccountAnalysis;
    const validIds = new Set(parsed.contacts.map(c => c.id));
    
    // Safety check for hierarchy loops and invalid IDs
    parsed.contacts = parsed.contacts.map(c => ({
      ...c,
      managerId: (c.managerId && validIds.has(c.managerId) && c.managerId !== c.id) ? c.managerId : null
    }));
    
    return parsed;
  } catch (e) {
    throw new Error("Analysis failed. Please ensure documents contain person names and titles.");
  }
};