
import { GoogleGenAI, Type } from "@google/genai";
import { AccountAnalysis } from "../types.ts";

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
          managerId: { type: Type.STRING, description: "ID of manager. If unknown, leave null or infer from title seniority." },
          department: { type: Type.STRING },
          buyingRole: { 
            type: Type.STRING, 
            description: "Decision Maker, Technical Influencer, Internal Advocate, or User." 
          },
          strategicAction: { type: Type.STRING },
          powerLevel: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
          stance: { type: Type.STRING, enum: ["Supportive", "Neutral", "Resistant", "Unknown"] },
          alignmentRisk: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
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
  try {
    // Strictly following GoogleGenAI initialization guidelines
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: [{
        parts: [{
          text: `
            TASK: Build a high-fidelity organizational hierarchy and stakeholder analysis from the provided enterprise account documents.
            
            HIERARCHY LOGIC:
            1. TITLE PARITY: Titles like "VP", "Vice President", "SVP" are senior leadership. They should not report to Directors or Managers.
            2. INFERENCE: If reporting lines aren't explicit, use seniorityRank to build a logical tree. Lower ranks report to higher ranks within the same department.
            3. DUPLICATES: If a person appears multiple times with slightly different names, merge them.

            INPUT DOCUMENTS:
            """
            ${text}
            """
          `
        }]
      }],
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA as any,
        temperature: 0.1,
        thinkingConfig: { thinkingBudget: 8000 }
      }
    });

    const parsed = JSON.parse(response.text || "{}") as AccountAnalysis;
    
    // Final ID validation to ensure tree integrity
    const validIds = new Set(parsed.contacts.map(c => c.id));
    parsed.contacts = parsed.contacts.map(c => ({
      ...c,
      managerId: (c.managerId && validIds.has(c.managerId) && c.managerId !== c.id) ? c.managerId : null
    }));

    return parsed;
  } catch (err: any) {
    console.error("Gemini Analysis Error:", err);
    throw new Error(err.message || "Failed to analyze document.");
  }
};