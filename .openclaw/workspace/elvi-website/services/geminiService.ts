
import { GoogleGenAI } from "@google/genai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

export const getAIAdvisorResponse = async (userPrompt: string, history: { role: string; parts: { text: string }[] }[]) => {
  if (!API_KEY) {
    return "CONFIG_ERROR: API_KEY_MISSING. ACCESS DENIED.";
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: [
        ...history,
        { role: "user", parts: [{ text: userPrompt }] }
      ],
      config: {
        systemInstruction: `You are the ZeDigital Principal Technical Architect. 
        ZeDigital is an elite engineering firm providing technical feasibility, cloud architecture, and strategic modernization.
        
        YOUR ROLE:
        - Provide high-level technical consultation.
        - Analyze business requirements from a software engineering perspective.
        - Be concise, analytical, and professional.
        - Use architectural terms (Scalability, LATENCY, RESILIENCE, MICROSERVICES).
        - DO NOT be conversational or friendly. Be helpful and factual.
        - Format with professional Markdown. Use code blocks for architectural diagrams if possible.`,
        temperature: 0.2, // Lower temperature for more consistent, serious responses
        topP: 0.8,
        topK: 40,
      }
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "SYSTEM_HALT: UNEXPECTED_EXCEPTION. PLEASE RELOAD.";
  }
};

// Service Finder AI Analysis
export interface ServiceFinderAnswers {
  goal: string;
  timeline: string;
  expertise: string;
  priority: string;
}

export interface ServiceRecommendation {
  title: string;
  matchPercentage: number;
}

export const getServiceFinderAnalysis = async (
  answers: ServiceFinderAnswers,
  recommendations: ServiceRecommendation[]
): Promise<string> => {
  if (!API_KEY) {
    throw new Error("API_KEY_MISSING");
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  // Format the user's answers for context
  const answerLabels: Record<string, Record<string, string>> = {
    goal: {
      website: 'Website or Web App',
      software: 'Custom Software',
      ai: 'AI Integration',
      security: 'Security Review',
    },
    timeline: {
      urgent: 'Urgent (< 1 month)',
      standard: 'Standard (1-3 months)',
      flexible: 'Flexible (3+ months)',
      ongoing: 'Ongoing Partnership',
    },
    expertise: {
      'non-technical': 'Non-Technical',
      some: 'Some Experience',
      technical: 'Technical Background',
      developer: 'Developer/Engineer',
    },
    priority: {
      speed: 'Speed to Market',
      quality: 'Quality & Reliability',
      security: 'Security & Compliance',
      scalability: 'Scalability',
    },
  };

  const formattedAnswers = `
- Goal: ${answerLabels.goal[answers.goal] || answers.goal}
- Timeline: ${answerLabels.timeline[answers.timeline] || answers.timeline}
- Technical Expertise: ${answerLabels.expertise[answers.expertise] || answers.expertise}
- Priority: ${answerLabels.priority[answers.priority] || answers.priority}
`;

  const topRecommendations = recommendations
    .slice(0, 3)
    .map((r) => `${r.title} (${r.matchPercentage}% match)`)
    .join(', ');

  const prompt = `Based on the following client requirements analysis:
${formattedAnswers}

Our system has recommended these services: ${topRecommendations}

Please provide a personalized technical analysis (3-4 paragraphs) that:
1. Validates why these services align with their goals
2. Suggests a practical approach or starting point
3. Mentions any considerations specific to their timeline and expertise level
4. Ends with a clear call-to-action to discuss their project

Keep the tone professional but approachable. Do not use excessive technical jargon given their expertise level is "${answerLabels.expertise[answers.expertise] || answers.expertise}".`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: `You are Z.E Digital's Service Advisor, helping potential clients understand how our services can meet their needs.

Z.E Digital offers these services:
- Web Development: Full-stack applications, responsive design, e-commerce, PWAs
- AI Solutions: Machine learning, chatbots, predictive analytics, automation
- Software Development: Enterprise apps, APIs, cloud architecture, microservices
- Cybersecurity: Security audits, penetration testing, compliance, incident response

YOUR APPROACH:
- Be helpful, clear, and professional
- Adapt your language to the client's technical expertise
- Focus on practical value and outcomes
- Keep responses concise but informative (3-4 short paragraphs max)
- Do not use bullet points or markdown headers - write in flowing prose
- End with encouragement to reach out`,
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
      },
    });

    return response.text || "We'd love to discuss how we can help with your project. Please reach out to our team.";
  } catch (error) {
    console.error("Service Finder AI Error:", error);
    throw error;
  }
};
